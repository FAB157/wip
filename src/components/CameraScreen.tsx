import { useState, useRef, useEffect } from 'react';
import { Camera, X, ImageIcon, Loader2, Search, Ticket, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { Language, getTranslation } from '../lib/i18n';
import { notify } from '../lib/toast';
import QuotaLimitToast, { useQuotaToast } from './QuotaLimitToast';
import { useCreditConfirmation } from '../hooks/useCreditConfirmation';
import CreditConfirmationModal from './CreditConfirmationModal';
import { PRICING_LIST, getWalletBalance, notifyCreditsChanged } from '../lib/pricing';
import ShopScreen from './ShopScreen';
import { logApiCall } from '../lib/apiLogger';
import { getApiUrl } from '../lib/api';
import { locationService } from '../services/locationService';
import { getLocalMuseumPassExpiry, getLocalMuseumPassTier, fetchMuseumPassFull, buyMuseumPass, formatPassRemaining, MuseumPassTier } from '../lib/museumPass';
import AROverlay from './AROverlay';
import VisionCommentModal from './VisionCommentModal';
import VisionLocationPicker, { VisionCoordsSource, VisionLocationPick } from './VisionLocationPicker';
import VisionCandidatesModal from './VisionCandidatesModal';
import { readJpegExif } from '../lib/exif';
import { db } from '../lib/db';
import { toggleFavoritePoi, getLocalFavorites } from '../lib/favorites';
import { getNearbyPois } from '../services/poiRepository';
import MuseumVisitSheet from './MuseumVisitSheet';
import LoadingQuiz from './LoadingQuiz';
import { MuseumVisit, MUSEUM_VISIT_EVENT, OPEN_MUSEUM_VISIT_EVENT, getVisit, onArtworkRecognized, startVisitByName, startVisitByPoi, fetchVenueGuide, startVisitFromGuide, countSeen, fetchMuseumLibrary, MuseumLibraryItem, fetchMuseumSuggest, MuseumSuggestion, riapriVisitaConservata, whereAmI, DoveSono, markWorkSeen } from '../lib/museumVisit';
import { visiteConservate, opereInArchivio, ArchivioMuseo } from '../lib/pacchettoMuseo';
import { speakAudioguide, stopSpeech } from '../services/ttsService';
import { getGuideCharacter } from '../lib/guideSettings';
import { Landmark } from 'lucide-react';

// ── Provenienza della foto (Vision v2) ──────────────────────────────────────
// photoSource: da dove arriva l'immagine. coordsSource: da dove arrivano le
// coordinate. REGOLA: una foto dalla GALLERIA non manda MAI il GPS del
// telefono: EXIF → pin dell'utente → niente ('none'). Il server rifiuta
// comunque lat/lon di galleria che non siano 'exif' o 'user_pin'.
type PhotoSource = 'camera' | 'gallery';
type ShotMeta = {
  photoSource: PhotoSource;
  /** JPEG ≤1600 px q0.8 per lo storage (assente se la sorgente era ≤800 px). */
  hiRes?: string;
  /** Coordinate già decise (exif/user_pin/none). Se assenti → GPS del device. */
  coords?: { lat: number | null; lon: number | null; coordsSource: VisionCoordsSource };
  /** DateTimeOriginal EXIF in ISO, se la foto lo dichiara. */
  takenAt?: string | null;
};

// ── «Da reel a itinerario» (modalità 📱 Screenshot) ────────────────────────
// Luogo estratto dal server (/api/vision mode:'screenshot'): name/city dal
// modello, found/lat/lon/label dal geocoding server-side (Mapbox).
type ReelPlace = {
  name: string;
  city?: string | null;
  found: boolean;
  lat?: number | null;
  lon?: number | null;
  label?: string | null;
};

// Wishlist esterna: luoghi del reel SENZA un POI corrispondente nel DB
// (entro 150 m). Vive solo in localStorage, max 100 voci (le più vecchie
// escono). Un futuro aggancio potrà proporne l'esplorazione.
const REEL_WISHLIST_KEY = 'wip_reel_wishlist';
const REEL_WISHLIST_MAX = 100;

// Ponte verso il pianificatore: i luoghi selezionati del reel finiscono qui
// e si naviga alla tab Plan. Formato: { city: string, places: [{ name, lat,
// lon }], ts: epoch ms } — lat/lon null se il geocoding non ha trovato nulla.
// TODO(PlanScreen): consumare 'wip_reel_to_plan' all'apertura della tab Plan
// (prefill destinazione + tappe). NON implementato qui: un altro agente sta
// lavorando su PlanScreen, la chiave è pensata per quell'aggancio futuro.
const REEL_TO_PLAN_KEY = 'wip_reel_to_plan';

interface CameraScreenProps {
  onRecognize: (data: any) => void;
  onClose?: () => void;
  language: Language;
}

// ── CODA VISION OFFLINE ─────────────────────────────────────────────────────
// Foto scattate senza rete: finiscono in Dexie (db.visionQueue) e vengono
// riconosciute (con addebito) al ritorno online. Mai base64 in stato React.
const VISION_QUEUE_MAX = 10;
const VISION_QUEUE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 giorni
const VISION_QUEUE_MAX_ATTEMPTS = 3;

// Errore di RETE (la fetch non ha mai raggiunto il server → nessun addebito):
// TypeError "Failed to fetch" (Chrome), "Load failed" (Safari), NetworkError.
const isNetworkError = (e: any): boolean => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = String(e?.message || '').toLowerCase();
  return e instanceof TypeError || msg.includes('failed to fetch') || msg.includes('load failed') || msg.includes('networkerror') || msg.includes('network request failed');
};

// Compressione per la coda: lato max 1280 px, JPEG qualità 0.7. Le foto
// scattate/scelte in-app sono già ridotte a ≤800 px e passano invariate;
// il ricampionamento scatta solo se in futuro arrivasse un'immagine più
// grande. In caso di errore si tiene l'originale: meglio che perdere la foto.
const compressForQueue = (dataUrl: string, maxSide = 1280, quality = 0.7): Promise<string> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width <= maxSide && height <= maxSide) return resolve(dataUrl);
      const scale = maxSide / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });

// ── Due risoluzioni da un'unica decodifica ─────────────────────────────────
// ≤800 px q0.6 per il modello (come sempre) e, SOLO se la sorgente supera
// 800 px sul lato lungo, ≤1600 px q0.8 per lo storage/pubblicazione
// (imageHiResBase64). Mai upscaling: una foto da 900 px resta a 900 px.
const VISION_LOW_SIDE = 800;
const VISION_HI_SIDE = 1600;
type ResizedShot = { base64: string; hiRes?: string };

const fitWithin = (w: number, h: number, maxSide: number) => {
  if (w <= maxSide && h <= maxSide) return { w, h };
  if (w > h) return { w: maxSide, h: Math.round((h * maxSide) / w) };
  return { w: Math.round((w * maxSide) / h), h: maxSide };
};

const drawToJpegBase64 = (src: CanvasImageSource, w: number, h: number, quality: number): string | null => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality).split(',')[1];
};

const encodeShot = (src: CanvasImageSource, srcW: number, srcH: number): ResizedShot | null => {
  const low = fitWithin(srcW, srcH, VISION_LOW_SIDE);
  const base64 = drawToJpegBase64(src, low.w, low.h, 0.6);
  if (!base64) return null;
  const out: ResizedShot = { base64 };
  if (Math.max(srcW, srcH) > VISION_LOW_SIDE) {
    const hi = fitWithin(srcW, srcH, VISION_HI_SIDE);
    const hiRes = drawToJpegBase64(src, hi.w, hi.h, 0.8);
    if (hiRes) out.hiRes = hiRes;
  }
  return out;
};

export default function CameraScreen({ onRecognize, onClose, language }: CameraScreenProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string>('');
  // 'visite': la sezione musei e chiese, terzo modo di WIP Vision.
  const [mode, setMode] = useState<'vision' | 'ar' | 'visite'>('vision');
  // Vision opere musei (ondata 7): in modalità "Opera" il server riceve
  // mode:'artwork' → prompt da storico dell'arte, cache GPS bypassata (due
  // opere distano pochi metri). Col Pass Museo attivo la scansione è inclusa.
  // Modalità "Natura": mode:'nature' → prompt da naturalista, cache GPS
  // standard attiva (due scatti dello stesso panorama riusano la scheda).
  // Modalità "Screenshot" («Da reel a itinerario»): mode:'screenshot' → il
  // server estrae i luoghi citati nello screenshot e li geocodifica; niente
  // cache GPS (lo screenshot non c'entra con la posizione), stesso costo
  // photo_search.
  const [visionTarget, setVisionTarget] = useState<'place' | 'artwork' | 'nature' | 'screenshot'>('place');
  // Risultato dell'estrazione reel: apre lo sheet "Luoghi trovati".
  const [reelResult, setReelResult] = useState<{ places: ReelPlace[]; sourceHint?: string } | null>(null);
  // Indici (in reelResult.places) dei luoghi spuntati nella checklist.
  const [reelSelected, setReelSelected] = useState<Set<number>>(new Set());
  const [reelBusy, setReelBusy] = useState(false);
  const { quotaToast, showQuotaToast, closeQuotaToast } = useQuotaToast();
  
  const creditConfirm = useCreditConfirmation();
  const [currentBalance, setCurrentBalance] = useState(0);
  const [shopUserId, setShopUserId] = useState<string | null>(null);
  // Foto NON riconosciuta: crediti già rimborsati dal server, la scheda resta
  // in My Vision → chiediamo all'utente di raccontare perché è speciale.
  const [commentCard, setCommentCard] = useState<{ cardId: string | null; image: string; refunded: boolean } | null>(null);
  // Foto dalla galleria SENZA GPS EXIF: il payload (anche l'hi-res) resta in
  // un ref, lo stato apre solo il picker «Dove hai scattato questa foto?».
  const pendingGalleryRef = useRef<{ base64: string; hiRes?: string; takenAt: string | null } | null>(null);
  const [locationPicker, setLocationPicker] = useState<{ device: { lat: number; lon: number } | null } | null>(null);
  // Riconoscimento a bassa confidenza (<70) con candidati: selettore prima
  // di aprire la scheda; la scelta riscrive la scheda gratis (/vision/choose).
  const [candidatesModal, setCandidatesModal] = useState<{ data: any; candidates: string[] } | null>(null);
  const [candBusy, setCandBusy] = useState(false);
  // Scorciatoia per le chiavi vis_* (i18n a 7 lingue)
  const tr = (key: string) => getTranslation(key, language);
  // Pass Museo: mirror locale subito (musei = rete scarsa), poi verità server.
  const [passExpiresAt, setPassExpiresAt] = useState<number | null>(getLocalMuseumPassExpiry());
  // Livello del pass: 'base' (40 audioguide) o 'tour' (anche la visita guidata).
  const [passTier, setPassTier] = useState<MuseumPassTier | null>(getLocalMuseumPassTier());
  const [passScans, setPassScans] = useState<{ used: number; limit: number }>({ used: 0, limit: 40 });
  const [buyingPass, setBuyingPass] = useState(false);
  // Foto in analisi: sfondo del mirino di scansione stile AR.
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const passActive = passExpiresAt !== null && passExpiresAt > Date.now();
  // Coda Vision offline: nello stato React vive SOLO il conteggio (mai i
  // base64, che restano in Dexie e vengono letti uno alla volta).
  const [queueCount, setQueueCount] = useState(0);
  const [queueProcessing, setQueueProcessing] = useState(false);
  const processingQueueRef = useRef(false);

  // ── VISITA GUIDATA DALL'AI (10/09/2026) ─────────────────────────────────
  // Dentro un museo/chiesa WIP accompagna: dopo il primo scatto (o col tasto
  // «Avvia la visita guidata») risolve DOVE sei da GPS + luogo dichiarato
  // dal modello e propone il percorso; ogni opera inquadrata viene spuntata.
  // Lo stato vive in museumVisit.ts; qui solo la vista.
  const [visit, setVisit] = useState<MuseumVisit | null>(() => getVisit());
  const [visitOpen, setVisitOpen] = useState(false);
  const [visitStarting, setVisitStarting] = useState(false);
  // Quale riga dell'elenco "qui vicino" sta generando la propria guida: solo
  // quella mostra lo spinner al posto della foto/icona, le altre restano
  // toccabili solo dopo (visitStarting le disabilita tutte, ma questo dice
  // QUALE sta lavorando).
  const [avviandoKey, setAvviandoKey] = useState<string | null>(null);
  // Ripiego SOLO quando il GPS non trova nessun luogo: campo per il nome.
  const [visitNameFallback, setVisitNameFallback] = useState<string | null>(null);
  // Il server ha risposto che la visita guidata è del pass con itinerario.
  const [needsTourPass, setNeedsTourPass] = useState(false);
  // Sezione Visite: i musei e le chiese qui intorno che hanno la guida pronta.
  const [museiVicini, setMuseiVicini] = useState<MuseumLibraryItem[] | null>(null);
  const [cercaMuseo, setCercaMuseo] = useState('');
  // AUTOCOMPLETAMENTO della casella (12/09/2026, committente: «una casella
  // che si autocompleti e che accetti errori e più lingue»). Dopo 300 ms
  // di pausa nella digitazione si chiedono i suggerimenti: guide pronte,
  // musei dell'archivio, voci Wikipedia; la richiesta precedente si annulla.
  const [suggerimenti, setSuggerimenti] = useState<MuseumSuggestion[] | null>(null);
  const [suggerendo, setSuggerendo] = useState(false);
  const suggTimer = useRef<number | null>(null);
  const suggAbort = useRef<AbortController | null>(null);
  // Le coordinate lette per la sezione Visite: servono ai suggerimenti per
  // mettere prima i luoghi vicini, senza rileggere il GPS a ogni lettera.
  const coordsVisite = useRef<{ lat: number | null; lon: number | null }>({ lat: null, lon: null });
  const onCercaMuseo = (v: string) => {
    setCercaMuseo(v);
    if (suggTimer.current) window.clearTimeout(suggTimer.current);
    suggAbort.current?.abort();
    const q = v.trim();
    if (q.length < 2) { setSuggerimenti(null); setSuggerendo(false); return; }
    setSuggerendo(true);
    suggTimer.current = window.setTimeout(async () => {
      const ctrl = new AbortController();
      suggAbort.current = ctrl;
      const out = await fetchMuseumSuggest({ q, lat: coordsVisite.current.lat, lon: coordsVisite.current.lon, language, signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      setSuggerimenti(out);
      setSuggerendo(false);
    }, 300);
  };
  const scegliSuggerimento = (s: MuseumSuggestion) => {
    suggAbort.current?.abort();
    setSuggerimenti(null);
    setSuggerendo(false);
    setCercaMuseo(s.venue_name);
    void apriVisitaDiElenco(s);
  };
  // LE TUE VISITE: quelle già fatte, conservate per sempre. Sono roba già
  // pagata e si riaprono senza chiamare il server — anche in aereo.
  const [visiteSalvate, setVisiteSalvate] = useState<ArchivioMuseo[]>([]);
  // DOVE SONO, dal GPS, prima di toccare qualsiasi cosa: nome e foto del
  // museo entro 200 m. Niente AI, un secondo. Il primo minuto non è più muto.
  const [seiQui, setSeiQui] = useState<DoveSono | null>(null);
  // L'ASSAGGIO (11/09/2026): quando il server dice «serve il pass» e la guida
  // esiste già, manda i primi novanta secondi dell'introduzione. Si ascolta
  // la voce PRIMA di pagare, come in ogni podcast.
  const [passSample, setPassSample] = useState<{ text: string; language: string } | null>(null);
  // Per QUALE luogo il server ha chiesto il pass (nome del museo toccato
  // nell'elenco o cercato): compare in testa alla scheda «serve il pass».
  const [passPerLuogo, setPassPerLuogo] = useState<string | null>(null);
  // La scheda «serve il pass»: ci si scorre sopra quando il server risponde
  // così a un tocco più in basso nell'elenco, altrimenti la risposta resta
  // fuori dallo schermo e il tocco sembra a vuoto.
  const schedaPassRef = useRef<HTMLDivElement | null>(null);
  // POCHE OPERE (12/09/2026, committente): il server ha detto che la guida
  // di questo museo ha meno di {minOpere} opere. Il pass da 100/150 non
  // conviene: lo si scrive, si consigliano le scansioni singole a 5 crediti
  // e la cassa del pass resta chiusa per questo museo.
  const [pocheOpere, setPocheOpere] = useState<{ nome: string; opere: number; minOpere: number; prezzo: number } | null>(null);
  const mostraPocheOpere = (nome: string | null, out: { opere?: number; minOpere?: number; prezzoScansione?: number }) => {
    setNeedsTourPass(false);
    setPocheOpere({ nome: nome || '', opere: out.opere ?? 0, minOpere: out.minOpere ?? 12, prezzo: out.prezzoScansione ?? PRICING_LIST.photo_search });
    notify(tr('mv_poche_opere_title'));
    window.setTimeout(() => schedaPassRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  };
  const mostraSchedaPass = (nome: string | null, sample: { text: string; language: string } | null) => {
    setPocheOpere(null);
    setNeedsTourPass(true);
    setPassPerLuogo(nome);
    setPassSample(sample);
    notify(tr('mv_locked_title'));
    // Al prossimo frame la scheda esiste (needsTourPass appena messo a true).
    window.setTimeout(() => schedaPassRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  };
  // La scansione non ha riconosciuto l'opera: si sceglie con gli occhi fra
  // quelle del percorso, la sala in cui si è per prima.
  const [sceltaOpera, setSceltaOpera] = useState<{ cardId: string | null; image: string; refunded: boolean } | null>(null);
  const [samplePlaying, setSamplePlaying] = useState(false);
  const toggleSample = async () => {
    if (!passSample) return;
    if (samplePlaying) { stopSpeech(); setSamplePlaying(false); return; }
    try {
      await speakAudioguide(passSample.text, String(passSample.language || language).toLowerCase(), getGuideCharacter(), () => setSamplePlaying(false));
      setSamplePlaying(true);
    } catch { setSamplePlaying(false); }
  };
  // Quiz durante l'attesa (10/09/2026, richiesta del committente: «come negli
  // itinerari»). Costruire il percorso di un museo richiede 20-35 secondi:
  // invece di far guardare una rotellina, si gioca e si vincono crediti — un
  // credito e 20 punti per risposta giusta, accreditati dal server.
  const [quizUserId, setQuizUserId] = useState<string | null>(null);
  const [quizAperto, setQuizAperto] = useState(false);
  const [quizLuogo, setQuizLuogo] = useState('');

  /** Apre il quiz mentre la guida si costruisce. Senza login niente quiz. */
  const apriQuizAttesa = async (nomeLuogo: string) => {
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data?.session?.user?.id;
      if (!uid) return;
      setQuizUserId(uid);
      setQuizLuogo(nomeLuogo || visit?.venue?.name || '');
      setQuizAperto(true);
    } catch { /* il quiz è un di più: mai bloccare la generazione */ }
  };
  const chiudiQuiz = () => setQuizAperto(false);

  /** Elenco dei luoghi con visita già pronta, per la sezione Visite. */
  const caricaMuseiVicini = async () => {
    // Le visite già fatte si leggono dal telefono: nessuna attesa, nessuna
    // rete. Si mostrano PRIMA dell'elenco «qui vicino», perché sono già
    // dell'utente.
    setVisiteSalvate(visiteConservate(language));
    const coords = await resolveVisitCoords();
    coordsVisite.current = coords;
    // In parallelo: «dove sono» (istantaneo) e l'elenco dei vicini.
    const [qui, elenco] = await Promise.all([
      whereAmI(coords, language),
      fetchMuseumLibrary({ lat: coords.lat, lon: coords.lon, language, radiusKm: 30, limit: 20 }),
    ]);
    setSeiQui(qui);
    setMuseiVicini(elenco);
  };

  /**
   * Riapre una visita conservata. Non chiama il server, quindi non consuma
   * pass né crediti: è esattamente il senso di «quello che hai è tuo».
   */
  const riapriConservata = (a: ArchivioMuseo) => {
    const v = riapriVisitaConservata(a);
    if (v) { setVisit(v); setVisitOpen(true); }
  };

  /** Apre la visita di un museo scelto dall'elenco (o cercato per nome). */
  const apriVisitaDiElenco = async (m: MuseumLibraryItem) => {
    if (visitStarting) return;
    setVisitStarting(true);
    // Un museo senza guida in libreria la genera al volo: può volerci fino a
    // un minuto (vedi Agnes sui prompt lunghi). Senza un avviso subito, il
    // tocco sembra non aver fatto nulla — l'unico segnale prima era lo
    // spinner generico sull'icona "Sei qui", invisibile per un tocco più giù
    // nell'elenco (11/09/2026, segnalazione utente: "ho cliccato e non
    // succede nulla").
    setAvviandoKey(m.venue_key);
    notify(tr('mv_generating').replace('{s}', m.venue_name));
    void apriQuizAttesa(m.venue_name);
    try {
      const out = m.poi_id
        ? await startVisitByPoi(m.poi_id, language, { lat: m.lat, lon: m.lon })
        : await startVisitByName(m.venue_name, { lat: m.lat, lon: m.lon }, language);
      if (out.ok && out.visit) { setVisit(out.visit); setVisitOpen(true); }
      // Prima qui c'era solo setNeedsTourPass(true): se la scheda «serve il
      // pass» era GIÀ aperta per un altro museo, non cambiava niente sullo
      // schermo (12/09/2026, «se clicco su Palazzo delle Logge non succede
      // nulla»). Ora la scheda prende il nome del museo toccato, l'assaggio
      // della sua introduzione, e ci si scorre sopra.
      else if (out.reason === 'needs_tour_pass') mostraSchedaPass(m.venue_name, out.sample || null);
      else if (out.reason === 'poche_opere') mostraPocheOpere(m.venue_name, out);
      else notify(tr('mv_not_found'));
    } catch (e) {
      console.warn('[Visite] Avvio visita fallito:', e);
      notify(tr('mv_not_found'));
    } finally {
      setVisitStarting(false);
      setAvviandoKey(null);
      setQuizAperto(false);
    }
  };

  useEffect(() => {
    const onVisit = () => setVisit(getVisit());
    const onOpen = () => { setVisit(getVisit()); setVisitOpen(true); };
    window.addEventListener(MUSEUM_VISIT_EVENT, onVisit);
    window.addEventListener(OPEN_MUSEUM_VISIT_EVENT, onOpen);
    return () => {
      window.removeEventListener(MUSEUM_VISIT_EVENT, onVisit);
      window.removeEventListener(OPEN_MUSEUM_VISIT_EVENT, onOpen);
    };
  }, []);

  /**
   * Posizione per la visita: dentro un edificio il GPS puro spesso non
   * aggancia, quindi si accetta l'ultimo fix noto (anche quello dell'ingresso,
   * fino a 10 minuti prima) e la localizzazione di rete (Wi-Fi/celle), che sul
   * telefono è già fusa nel servizio di geolocalizzazione del browser.
   */
  const resolveVisitCoords = async (): Promise<{ lat: number | null; lon: number | null }> => {
    const last = locationService.getLastLocation();
    if (last && last.latitude && last.longitude) return { lat: last.latitude, lon: last.longitude };
    try {
      const pos: any = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 6000, maximumAge: 10 * 60 * 1000 });
      });
      return { lat: pos.coords.latitude, lon: pos.coords.longitude };
    } catch {
      return { lat: null, lon: null };
    }
  };

  /** Tasto «Avvia la visita guidata»: dove sono? → percorso. */
  const startGuidedVisit = async (typedName?: string) => {
    if (visitStarting) return;
    setVisitStarting(true);
    // Il quiz parte SUBITO: la guida si costruisce dietro, e alla fine il
    // quiz si chiude da solo consegnando i crediti vinti.
    void apriQuizAttesa(typedName || '');
    try {
      const coords = await resolveVisitCoords();
      // Prima qui c'era anche una voce di sistema («Sei agli Uffizi, sto
      // preparando il percorso»): su iOS con i sottotitoli in diretta attivi
      // (Accessibilità → Contenuto vocale) fa comparire una fascia di
      // sottotitoli di SISTEMA, sopra qualunque schermata dell'app, che resta
      // visibile anche cambiando tab — non è un elemento nostro, e toccare la
      // X dentro l'app non la chiude (11/09/2026, segnalazione utente: la
      // fascia "Sei a Duomo..." restava fissa passando da Radar AR a Visite
      // alla Mappa). Il nome del luogo è già scritto nella scheda "Sei qui":
      // la voce era un di più, non l'unica fonte dell'informazione.
      if (typedName && typedName.trim().length >= 3) {
        const out = await startVisitByName(typedName.trim(), coords, language);
        if (out.ok && out.visit) { setVisitNameFallback(null); setVisit(out.visit); setVisitOpen(true); }
        else if (out.reason === 'needs_tour_pass') mostraSchedaPass(typedName.trim(), out.sample || null);
        else if (out.reason === 'poche_opere') mostraPocheOpere(typedName.trim(), out);
        else notify(out.reason === 'network' ? tr('vis_generic_error') : tr('mv_not_found'));
        return;
      }
      if (coords.lat === null) { setVisitNameFallback(''); return; }
      const resp = await fetchVenueGuide({ lat: coords.lat, lon: coords.lon, language });
      if (resp && resp.ok === true) {
        const v = startVisitFromGuide(resp);
        setVisit(v);
        setVisitOpen(true);
      } else if (resp && resp.ok === false && resp.reason === 'needs_tour_pass') {
        // La visita guidata è del pass con itinerario: si propone lo sblocco,
        // senza generare nulla (nessun costo AI per chi non ha pagato).
        mostraSchedaPass(seiQui?.name || resp.venue?.name || null, resp.sample || null);
      } else if (resp && resp.ok === false && resp.reason === 'poche_opere') {
        mostraPocheOpere(seiQui?.name || resp.venue?.name || null, resp);
      } else if (resp && resp.ok === false && resp.reason === 'venue_unknown') {
        // Nessun museo/chiesa entro 200 m nel nostro archivio: si chiede il nome.
        setVisitNameFallback('');
      } else {
        notify(tr('mv_not_found'));
      }
    } finally {
      setVisitStarting(false);
      // Guida pronta: il quiz si chiude e i crediti vinti vengono accreditati
      // (LoadingQuiz li manda al server quando viene smontato).
      setQuizAperto(false);
    }
  };

  useEffect(() => {
    fetchMuseumPassFull().then(s => {
      setPassExpiresAt(s.expiresAt);
      setPassTier(s.tier);
      setPassScans({ used: s.scansUsed, limit: s.scansLimit });
    });
    // Tick per countdown e scadenza del banner senza rifetch.
    const t = setInterval(() => setTick(x => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // ── Coda Vision offline: purge, contatore e ripartenza ─────────────────
  // Al mount: scarta le voci >7 giorni, aggiorna il banner e (se c'è rete)
  // processa subito la coda. Poi resta in ascolto dell'evento 'online'.
  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        await db.visionQueue.where('ts').below(Date.now() - VISION_QUEUE_MAX_AGE_MS).delete();
        const n = await db.visionQueue.count();
        if (!disposed) setQueueCount(n);
      } catch { /* IndexedDB non disponibile: niente coda offline */ }
      processVisionQueue();
    })();
    const onOnline = () => { processVisionQueue(); };
    window.addEventListener('online', onOnline);
    return () => { disposed = true; window.removeEventListener('online', onOnline); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Accoda una foto scattata offline (max 10 in coda, compressa via canvas).
   * In coda va SOLO il dataUrl ≤1280 px: niente hi-res (Dexie resta leggera);
   * provenienza/coordinate/data viaggiano come campi extra (spread `as any`:
   * VisionQueueItem in db.ts non li dichiara, il server li legge comunque).
   */
  const enqueueOfflinePhoto = async (
    base64Image: string,
    lat: number | null,
    lon: number | null,
    extra: { photoSource: PhotoSource; coordsSource: VisionCoordsSource; takenAt: string | null }
  ) => {
    try {
      await db.visionQueue.where('ts').below(Date.now() - VISION_QUEUE_MAX_AGE_MS).delete();
      const count = await db.visionQueue.count();
      if (count >= VISION_QUEUE_MAX) {
        notify(tr('vis_queue_full').replace('{n}', String(VISION_QUEUE_MAX)));
        setQueueCount(count);
        return;
      }
      const dataUrl = await compressForQueue(`data:image/jpeg;base64,${base64Image}`);
      await db.visionQueue.add({
        dataUrl, lat, lon, mode: visionTarget, ts: Date.now(), attempts: 0,
        photoSource: extra.photoSource,
        coordsSource: extra.coordsSource,
        photoTakenAt: extra.takenAt,
      } as any);
      setQueueCount(count + 1);
      notify(tr('vis_offline_saved'), 'success');
    } catch (e) {
      console.warn('[Vision] Accodamento offline fallito:', e);
      setError(tr('vis_offline_fail'));
    }
  };

  /**
   * Processa la coda in sequenza col flusso normale (/api/vision, addebito al
   * momento del processamento). Voce rimossa a successo; a errore non-rete
   * resta in coda (max 3 tentativi, poi scartata con notifica); a errore di
   * rete si interrompe tutto e si riproverà al prossimo evento 'online'.
   */
  const processVisionQueue = async () => {
    if (processingQueueRef.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    processingQueueRef.current = true;
    let processedUserId: string | null = null;
    try {
      await db.visionQueue.where('ts').below(Date.now() - VISION_QUEUE_MAX_AGE_MS).delete();
      const ids = await db.visionQueue.orderBy('ts').primaryKeys();
      if (!ids.length) return;
      setQueueProcessing(true);
      const { data: sessionData } = await supabase.auth.getSession();
      processedUserId = sessionData?.session?.user?.id || null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const accessToken = sessionData?.session?.access_token;
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      for (const id of ids) {
        // Una voce alla volta in memoria: mai l'intera coda di base64 insieme.
        const item = await db.visionQueue.get(id as number);
        if (!item) continue;
        try {
          const res = await fetch(getApiUrl('/api/vision'), {
            method: 'POST',
            headers,
            body: JSON.stringify({
              imageBase64: item.dataUrl,
              lat: item.lat,
              lon: item.lon,
              language,
              // Voci accodate prima di Vision v2 non hanno la provenienza:
              // erano tutte scatti col GPS del telefono.
              coordsSource: (item as any).coordsSource || 'device',
              ...((item as any).photoSource ? { photoSource: (item as any).photoSource } : {}),
              ...((item as any).photoTakenAt ? { photoTakenAt: (item as any).photoTakenAt } : {}),
              ...(item.mode && item.mode !== 'place' ? { mode: item.mode } : {})
            })
          });
          if (res.ok) {
            const data = await res.json().catch(() => null);
            await db.visionQueue.delete(id as number);
            if (data?.riconosciuto) {
              notify(tr('vis_queue_recognized').replace('{name}', String(data?.nome || '')), 'success');
            } else {
              notify(tr('vis_queue_not_recognized'));
            }
            try { window.dispatchEvent(new CustomEvent('wip-vision-updated')); } catch { /* ok */ }
          } else {
            // Errore applicativo (401/402/429/500): la rete c'è, si conta il tentativo.
            if (res.status === 402) notify(tr('vis_no_credits'));
            const attempts = (item.attempts || 0) + 1;
            if (attempts >= VISION_QUEUE_MAX_ATTEMPTS) {
              await db.visionQueue.delete(id as number);
              notify(`${tr('vis_generic_error')} (${res.status})`);
            } else {
              await db.visionQueue.update(id as number, { attempts });
            }
          }
        } catch (e) {
          if (isNetworkError(e)) break; // ancora offline: si riprova al prossimo 'online'
          const attempts = (item.attempts || 0) + 1;
          if (attempts >= VISION_QUEUE_MAX_ATTEMPTS) {
            await db.visionQueue.delete(id as number);
            notify(tr('vis_generic_error'));
          } else {
            await db.visionQueue.update(id as number, { attempts });
          }
        }
      }
    } catch (e) {
      console.warn('[Vision] Elaborazione coda offline fallita:', e);
    } finally {
      processingQueueRef.current = false;
      setQueueProcessing(false);
      try { setQueueCount(await db.visionQueue.count()); } catch { /* ok */ }
      // Gli addebiti/rimborsi delle voci processate sono avvenuti server-side.
      if (processedUserId) notifyCreditsChanged({ userId: processedUserId });
    }
  };

  // ── Prima card guidata (ondata 3) ──────────────────────────────────────
  // Al primo ingresso in camera un overlay in 3 passi spiega il gesto e la
  // ricompensa, e se il GPS risponde suggerisce un luogo vicino da provare.
  // Il primo contributo è il funnel critico: chi pubblica una card torna.
  const [showFirstGuide, setShowFirstGuide] = useState(() => {
    try { return !localStorage.getItem('wip_first_card_guide_done'); } catch { return false; }
  });
  const [nearbySuggestion, setNearbySuggestion] = useState<{ name: string; dist: number } | null>(null);
  useEffect(() => {
    if (!showFirstGuide || !('geolocation' in navigator)) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude: la, longitude: lo } = pos.coords;
        const d = 0.004; // ~400m
        const { data } = await supabase
          .from('shared_pois')
          .select('name, lat, lon')
          .gte('lat', la - d).lte('lat', la + d)
          .gte('lon', lo - d).lte('lon', lo + d)
          .neq('category', 'community')
          .limit(20);
        if (cancelled || !data?.length) return;
        const best = data
          .map((p: any) => ({ name: p.name, dist: Math.round(Math.hypot((p.lat - la) * 111320, (p.lon - lo) * 111320 * Math.cos(la * Math.PI / 180))) }))
          .sort((a: any, b: any) => a.dist - b.dist)[0];
        if (best) setNearbySuggestion(best);
      } catch { /* niente suggerimento, la guida resta valida */ }
    }, () => { /* permesso negato: nessun suggerimento */ }, { timeout: 3000, maximumAge: 60000 });
    return () => { cancelled = true; };
  }, [showFirstGuide]);
  const dismissFirstGuide = () => {
    try { localStorage.setItem('wip_first_card_guide_done', '1'); } catch { /* ok */ }
    setShowFirstGuide(false);
  };

  const openCreditShop = async () => {
    const { data } = await supabase.auth.getSession();
    setShopUserId(data?.session?.user?.id || "mock-user-id");
  };

  /**
   * Acquisto del Pass Museo, due livelli (10/09/2026):
   *  - 'base' 100 crediti: 40 audioguide, si inquadrano le opere che si vogliono
   *  - 'tour' 150 crediti: le stesse 40 più la visita guidata del museo
   * Con un pass base attivo, 'tour' costa solo la differenza e la scadenza
   * resta quella già pagata.
   */
  const handleBuyPass = async (tier: 'base' | 'tour' = 'base') => {
    if (buyingPass) return;
    // Museo con poche opere: niente cassa del pass, si ripete il consiglio
    // (12/09/2026, committente: «stessa logica per il pass da 150»).
    if (pocheOpere && !visit) {
      notify(tr('mv_poche_opere_desc').replace('{s}', pocheOpere.nome || tr('mv_title')).replace('{n}', String(pocheOpere.opere)).replace('{p}', String(pocheOpere.prezzo)));
      schedaPassRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const { data } = await supabase.auth.getSession();
    const uid = data?.session?.user?.id;
    if (!uid) { setError(tr('vis_pass_login')); return; }
    const bal = await getWalletBalance(uid);
    setCurrentBalance(bal.total);
    const upgrade = tier === 'tour' && passActive && passTier === 'base';
    const costo = upgrade
      ? Math.max(0, PRICING_LIST.museum_pass_tour - PRICING_LIST.museum_pass)
      : (tier === 'tour' ? PRICING_LIST.museum_pass_tour : PRICING_LIST.museum_pass);
    const confirmed = await creditConfirm.requestConfirmation(
      costo,
      tier === 'tour' ? getTranslation('museum_pass_tour_title', language) : getTranslation('museum_pass_title', language)
    );
    if (!confirmed) return;
    setBuyingPass(true);
    const out = await buyMuseumPass(tier);
    setBuyingPass(false);
    if (out.ok && out.expiresAt) {
      setPassExpiresAt(out.expiresAt);
      setPassTier(out.tier || tier);
      notify(getTranslation("museum_pass_bought", language));
      // Comprato il pass con itinerario: la visita parte subito.
      if ((out.tier || tier) === 'tour') void startGuidedVisit();
    } else if (out.error === 'credits') {
      notify(tr('vis_no_credits'));
      openCreditShop();
    } else if (out.error === 'login') {
      setError(tr('vis_pass_login'));
    } else {
      notify(getTranslation("museum_pass_error", language));
    }
  };

  /**
   * Ridimensiona il file scelto in due versioni (vedi encodeShot): base64
   * ≤800 px per il modello e hiRes ≤1600 px per lo storage, quest'ultima
   * solo se la sorgente è più grande di 800 px. L'EXIF va letto PRIMA di
   * chiamarla: il canvas butta via i metadati.
   */
  const resizeImage = (file: File): Promise<ResizedShot> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const shot = encodeShot(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
        if (!shot) return reject(new Error('Canvas non supportato'));
        resolve(shot);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Errore nel caricamento dell'immagine"));
      };
      img.src = url;
    });
  };

  // ── FOTOCAMERA LIVE (getUserMedia) ──────────────────────────────────────
  // Il file input con capture="environment" su molti PWA (soprattutto iOS in
  // standalone) viene IGNORATO e apre la galleria invece dell'obiettivo. Una
  // vera camera getUserMedia apre la posteriore in modo affidabile su tutti i
  // browser mobili moderni. Fallback all'input file se il permesso è negato.
  const openCamera = async () => {
    if (isScanning) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }, audio: false,
      });
      streamRef.current = stream;
      setShowCamera(true);
    } catch (e) {
      console.warn('[Camera] getUserMedia non disponibile, uso il file input:', e);
      cameraInputRef.current?.click();
    }
  };

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    // Stesse due risoluzioni del file upload, dal frame video corrente.
    const shot = encodeShot(video, video.videoWidth, video.videoHeight);
    if (!shot) return;
    closeCamera();
    setPreviewImage(`data:image/jpeg;base64,${shot.base64}`);
    // Scatto dal vivo: le coordinate sono quelle del device (decise in analyzeImage).
    await analyzeImage(shot.base64, { photoSource: 'camera', hiRes: shot.hiRes });
  };

  // Collega lo stream al <video> all'apertura; ferma le tracce allo smontaggio.
  useEffect(() => {
    if (showCamera && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [showCamera]);

  useEffect(() => () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
  }, []);

  const handleFileUpload = async (event: import('react').ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    // Da quale input arriva: fotocamera (capture) o galleria. Conta per le
    // coordinate: una foto di galleria non eredita MAI il GPS del telefono.
    const photoSource: PhotoSource = input === galleryInputRef.current ? 'gallery' : 'camera';

    try {
      setIsScanning(true);

      // Modalità 📱 Screenshot: niente EXIF né coordinate, flusso dedicato.
      if (visionTarget === 'screenshot') {
        const shot = await resizeImage(file);
        setPreviewImage(`data:image/jpeg;base64,${shot.base64}`);
        await analyzeScreenshot(shot.base64);
        return;
      }

      // EXIF PRIMA del resize (il canvas butta via i metadati). Non lancia
      // mai: file non JPEG o senza EXIF → tutto null.
      const exif = await readJpegExif(file);
      const shot = await resizeImage(file);
      setPreviewImage(`data:image/jpeg;base64,${shot.base64}`);

      if (photoSource === 'camera') {
        // Capture dell'OS: è uno scatto dal vivo, valgono le coordinate del device.
        await analyzeImage(shot.base64, { photoSource: 'camera', hiRes: shot.hiRes, takenAt: exif.takenAt });
        return;
      }

      if (exif.lat !== null && exif.lon !== null) {
        // La foto sa dove è stata scattata: coordinate oneste dall'EXIF.
        notify(tr('vis_exif_found'), 'success');
        await analyzeImage(shot.base64, {
          photoSource: 'gallery',
          hiRes: shot.hiRes,
          takenAt: exif.takenAt,
          coords: { lat: exif.lat, lon: exif.lon, coordsSource: 'exif' },
        });
        return;
      }

      // Nessun GPS nella foto: si chiede all'utente dove l'ha scattata. Il
      // picker continua il flusso (onLocationPicked → analyzeImage).
      setIsScanning(false);
      pendingGalleryRef.current = { base64: shot.base64, hiRes: shot.hiRes, takenAt: exif.takenAt };
      const last = locationService.getLastLocation();
      setLocationPicker({
        device: last && last.latitude && last.longitude ? { lat: last.latitude, lon: last.longitude } : null,
      });
    } catch (e) {
      console.error("Resize error:", e);
      setIsScanning(false);
      setError(tr('vis_resize_error'));
    } finally {
      // Reset del valore: senza, riselezionare la STESSA foto non fa scattare
      // onChange (il valore dell'input non cambia) e la scansione non parte.
      input.value = '';
    }
  };

  /** Esito del picker «Dove hai scattato questa foto?»: riparte la scansione. */
  const onLocationPicked = async (pick: VisionLocationPick) => {
    setLocationPicker(null);
    const pending = pendingGalleryRef.current;
    pendingGalleryRef.current = null;
    if (!pending) return;
    setIsScanning(true);
    await analyzeImage(pending.base64, {
      photoSource: 'gallery',
      hiRes: pending.hiRes,
      takenAt: pending.takenAt,
      coords: { lat: pick.lat, lon: pick.lon, coordsSource: pick.coordsSource },
    });
  };

  /**
   * Coordinate del device: prima il locationService (già in ascolto), poi
   * una geolocation diretta con timeout breve. null se non disponibili.
   */
  const resolveDeviceCoords = async (): Promise<{ lat: number; lon: number } | null> => {
    try {
      const lastLoc = locationService.getLastLocation();
      if (lastLoc && lastLoc.latitude && lastLoc.longitude) {
        return { lat: lastLoc.latitude, lon: lastLoc.longitude };
      }
      const pos: any = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
      });
      return { lat: pos.coords.latitude, lon: pos.coords.longitude };
    } catch (e) {
      console.debug("Could not get GPS coordinates for Camera Vision cache:", e);
      return null;
    }
  };

  // ── «Da reel a itinerario»: estrazione luoghi da uno screenshot ─────────
  // Flusso separato da analyzeImage: niente GPS, niente coda offline (lo
  // screenshot resta in galleria, si può ricaricare quando torna la rete),
  // niente scheda My Vision. Il server risponde { mode:'screenshot',
  // places:[{name, city, found, lat, lon, label}], sourceHint }.
  const analyzeScreenshot = async (base64Image: string) => {
    setIsScanning(true);
    setError('');

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setIsScanning(false);
      setPreviewImage(null);
      setError(tr('vis_reel_offline'));
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id || 'mock-user-id';

    // Conferma UX del costo (stesso photo_search): l'addebito vero è server-side.
    setIsScanning(false);
    const bal = await getWalletBalance(currentUserId);
    setCurrentBalance(bal.total);
    const confirmed = await creditConfirm.requestConfirmation(PRICING_LIST.photo_search, tr('vis_service_reel'));
    if (!confirmed) { setPreviewImage(null); return; }
    setIsScanning(true);

    // Telemetria: il primario di /api/vision è OpenAI (gpt-4o).
    logApiCall('openai_vision', 'reel_screenshot');

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const accessToken = sessionData?.session?.access_token;
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(getApiUrl('/api/vision'), {
        method: 'POST',
        headers,
        // NIENTE lat/lon: il contenuto dello screenshot non c'entra con la
        // posizione dell'utente (il server bypassa comunque la cache GPS).
        body: JSON.stringify({ imageBase64: base64Image, mode: 'screenshot', language })
      });

      if (res.status === 401) {
        setError(tr('vis_login_required'));
        return;
      }
      if (res.status === 402) {
        notify(tr('vis_no_credits'));
        openCreditShop();
        return;
      }
      if (res.status === 413) {
        setError(tr('vis_generic_error'));
        return;
      }
      if (res.status === 429) {
        const errData = await res.json().catch(() => null);
        setError(errData?.error === 'too_many_unrecognized' ? tr('vis_too_many_unrecognized') : getTranslation('camera_error_quota', language));
        return;
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || tr('vis_generic_error'));
      }

      const data = await res.json();
      const places: ReelPlace[] = Array.isArray(data?.places) ? data.places : [];
      if (places.length === 0) {
        // Il server ha già rimborsato (refunded) quando non estrae nulla.
        setError(tr('vis_reel_none'));
        return;
      }
      setReelResult({ places, sourceHint: data?.sourceHint || '' });
      setReelSelected(new Set(places.map((_: ReelPlace, i: number) => i)));
    } catch (err: any) {
      console.error(err);
      if (isNetworkError(err)) {
        setError(tr('vis_reel_offline'));
        return;
      }
      const errMsg = (err.message || '').toLowerCase();
      if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('rate limit')) {
        setError(getTranslation('camera_error_quota', language));
      } else {
        setError(err.message || getTranslation('camera_error_failed', language));
      }
    } finally {
      setIsScanning(false);
      setPreviewImage(null);
      notifyCreditsChanged({ userId: currentUserId });
    }
  };

  const analyzeImage = async (base64Image: string, meta: ShotMeta) => {
    // Modalità 📱 Screenshot: flusso dedicato (sopra), vale sia per la foto
    // scattata (schermo di un altro telefono) sia per il file dalla galleria.
    if (visionTarget === 'screenshot') {
      await analyzeScreenshot(base64Image);
      return;
    }
    setIsScanning(true);
    setError('');

    // Coordinate: se già decise a monte (EXIF / pin utente / «non lo so»)
    // si usano quelle; altrimenti (scatto dal vivo) il GPS del device.
    let gpsLat: number | null = meta.coords?.lat ?? null;
    let gpsLon: number | null = meta.coords?.lon ?? null;
    let coordsSource: VisionCoordsSource = meta.coords?.coordsSource ?? 'none';
    if (!meta.coords) {
      const dev = await resolveDeviceCoords();
      if (dev) {
        gpsLat = dev.lat;
        gpsLon = dev.lon;
        coordsSource = 'device';
      }
    }
    const takenAt = meta.takenAt ?? null;

    // ── OFFLINE: non perdere la foto ─────────────────────────────────────
    // Senza rete niente riconoscimento (e niente addebito): la foto va in
    // coda Dexie e verrà processata (con addebito) al ritorno online.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setIsScanning(false);
      setPreviewImage(null);
      await enqueueOfflinePhoto(base64Image, gpsLat, gpsLon, { photoSource: meta.photoSource, coordsSource, takenAt });
      return;
    }

    // La cache GPS condivisa e l'addebito ora vivono SOLO nel server
    // (/api/vision): la cache era scrivibile con la anon key (avvelenabile)
    // e il prelievo crediti client-side era bypassabile via cURL. Qui resta
    // solo la conferma UX del costo: hit di cache = il server non addebita.
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id || "mock-user-id";

    // Col Pass Museo attivo la scansione è inclusa: niente modale del costo.
    if (!passActive) {
      setIsScanning(false); // Pausa per mostrare il modale
      const bal = await getWalletBalance(currentUserId);
      setCurrentBalance(bal.total);
      const confirmed = await creditConfirm.requestConfirmation(
        PRICING_LIST.photo_search,
        visionTarget === 'artwork' ? tr('vis_service_artwork')
          : visionTarget === 'nature' ? tr('vis_service_nature')
          : tr('vis_service_name')
      );
      if (!confirmed) return;
      setIsScanning(true);
    }

    // Telemetria: il primario di /api/vision è OpenAI (gpt-4o).
    logApiCall('openai_vision', 'scansione_fotocamera');

    try {
      // getApiUrl: su app nativa il path relativo puntava agli asset locali
      // e la scansione falliva SEMPRE su telefono.
      // Bearer della sessione: OBBLIGATORIO per l'addebito server-side (401
      // senza login) e per intestare la scheda My Vision all'utente giusto.
      const visionHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      const accessToken = sessionData?.session?.access_token;
      if (accessToken) visionHeaders['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(getApiUrl('/api/vision'), {
        method: 'POST',
        headers: visionHeaders,
        body: JSON.stringify({
          // ≤800 px per il modello; hi-res ≤1600 px solo per storage/pubblicazione.
          imageBase64: base64Image,
          ...(meta.hiRes ? { imageHiResBase64: meta.hiRes } : {}),
          lat: gpsLat,
          lon: gpsLon,
          // Lingua dei testi generati (scheda nella lingua dell'app).
          language,
          // Provenienza onesta di foto e coordinate (vedi ShotMeta).
          photoSource: meta.photoSource,
          coordsSource,
          ...(takenAt ? { photoTakenAt: takenAt } : {}),
          // Modalità "Opera" (ondata 7): il server identifica l'opera
          // inquadrata (quadro/statua/reperto), non l'edificio del GPS.
          // Modalità "Natura": prompt da naturalista, categoria 'natura'.
          ...(visionTarget !== 'place' ? { mode: visionTarget } : {})
        })
      });

      if (res.status === 401) {
        setError(tr('vis_login_required'));
        return;
      }
      if (res.status === 402) {
        notify(tr('vis_no_credits'));
        openCreditShop();
        return;
      }
      if (res.status === 413) {
        // Immagine troppo grande per il server (non dovrebbe accadere: ≤1600 px).
        setError(tr('vis_generic_error'));
        return;
      }
      if (res.status === 429) {
        // 'Quota Exceeded' (limite generale) oppure 'too_many_unrecognized'
        // (anti-spam: troppe foto non riconosciute oggi).
        const errData = await res.json().catch(() => null);
        setError(errData?.error === 'too_many_unrecognized'
          ? tr('vis_too_many_unrecognized')
          : getTranslation('camera_error_quota', language));
        return;
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || tr('vis_generic_error'));
      }

      const data = await res.json();

      // Verità del server sul pass (es. scaduto tra una scansione e l'altra).
      if (typeof data.passExpiresAt === 'number' && data.passExpiresAt > Date.now()) {
        setPassExpiresAt(data.passExpiresAt);
      } else if (data.passActive === false && passActive) {
        setPassExpiresAt(null);
      }

      if (data.riconosciuto) {
        const enrichedData = { ...data, image: `data:image/jpeg;base64,${base64Image}` };
        // Privacy: volti riconoscibili → se pubblicata verranno sfocati.
        if (data.privacy?.volti === true) notify(tr('vis_privacy_people'), 'success');
        // Visita guidata: un'opera riconosciuta (modalità Opera o Pass Museo)
        // avvia o aggiorna la visita in sottofondo. La scheda dell'opera si
        // apre subito; il percorso arriva dopo, dalla scheda o dal riquadro.
        if (visionTarget === 'artwork' || passActive) {
          const hadVisit = !!getVisit();
          void onArtworkRecognized(data, { lat: gpsLat, lon: gpsLon }, language).then(v => {
            if (v && !hadVisit) notify(tr('mv_ready').replace('{name}', v.venue.name), 'success');
          });
        }
        // Bassa confidenza con candidati reali: selettore prima della scheda.
        const candidati: string[] = Array.isArray(data.candidati)
          ? data.candidati.filter((c: any) => typeof c === 'string' && c.trim()).slice(0, 3)
          : [];
        const confidenza = Number(data.confidenza);
        if (candidati.length > 0 && Number.isFinite(confidenza) && confidenza < 70 && data.card_id) {
          setCandidatesModal({ data: enrichedData, candidates: candidati });
        } else {
          onRecognize(enrichedData);
        }
      } else {
        // NON RICONOSCIUTA, MA SIAMO DENTRO UN MUSEO CON UN PERCORSO
        // (11/09/2026): vetro, riflessi, gente davanti — la foto non basta.
        // Invece di «non so», si mostrano le foto delle opere di questa sala
        // e la persona la riconosce con gli occhi in un secondo. Le foto e la
        // sala ce le abbiamo già.
        const visitaInCorso = getVisit();
        if (visionTarget === 'artwork' && (visitaInCorso?.guide?.tappe?.length || 0) > 0) {
          setSceltaOpera({ cardId: data.card_id || null, image: `data:image/jpeg;base64,${base64Image}`, refunded: !!data.refunded });
          return;
        }
        // Il server ha già (best-effort) rimborsato i crediti e salvato la
        // foto in My Vision: chiediamo all'utente perché quel posto è speciale
        // (il racconto aiuta la revisione WIP Community). `refunded` riflette
        // l'esito reale del rimborso server, non un messaggio fisso.
        setCommentCard({ cardId: data.card_id || null, image: `data:image/jpeg;base64,${base64Image}`, refunded: !!data.refunded });
      }
    } catch (err: any) {
      console.error(err);
      // Rete caduta DURANTE la fetch (mai arrivata al server → nessun
      // addebito): la foto non si perde, va in coda offline.
      if (isNetworkError(err)) {
        setPreviewImage(null);
        await enqueueOfflinePhoto(base64Image, gpsLat, gpsLon, { photoSource: meta.photoSource, coordsSource, takenAt });
        return;
      }
      // Match case-insensitive: il server risponde "Quota Exceeded" (maiuscolo).
      const errMsg = (err.message || '').toLowerCase();
      if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('rate limit')) {
        setError(getTranslation("camera_error_quota", language));
      } else {
        setError(err.message || getTranslation("camera_error_failed", language));
      }
    } finally {
      setIsScanning(false);
      // Addebito/rimborso sono avvenuti server-side: aggiorna i widget saldo
      // e il contatore My Vision.
      notifyCreditsChanged({ userId: currentUserId });
      try { window.dispatchEvent(new CustomEvent('wip-vision-updated')); } catch {}
    }
  };

  // ── Candidati a bassa confidenza ────────────────────────────────────────

  /**
   * L'utente ha scelto uno dei candidati: /api/vision/choose riscrive la
   * scheda (gratis) su quel soggetto e la scheda mostrata viene sostituita.
   * A qualsiasi errore si apre la scheda originale: il riconoscimento c'è
   * già stato e l'addebito pure.
   */
  const chooseCandidate = async (name: string) => {
    const current = candidatesModal;
    if (!current || candBusy) return;
    const { data } = current;
    setCandBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const accessToken = sessionData?.session?.access_token;
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
      const res = await fetch(getApiUrl('/api/vision/choose'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ cardId: data.card_id, name }),
      });
      const resp = await res.json().catch(() => null);
      if (res.ok && resp?.ok && resp.card) {
        onRecognize({ ...data, ...resp.card, image: data.image });
        try { window.dispatchEvent(new CustomEvent('wip-vision-updated')); } catch { /* ok */ }
      } else {
        onRecognize(data);
      }
    } catch (e) {
      console.warn('[Vision] /api/vision/choose fallita:', e);
      onRecognize(data);
    } finally {
      setCandBusy(false);
      setCandidatesModal(null);
    }
  };

  /** "Tieni la scheda così": apre la scheda originale. */
  const keepRecognized = () => {
    const current = candidatesModal;
    if (!current || candBusy) return;
    setCandidatesModal(null);
    onRecognize(current.data);
  };

  // ── Azioni dello sheet "Luoghi trovati" ─────────────────────────────────

  /**
   * 💛 Salva nei preferiti i luoghi selezionati: se entro 150 m dalle
   * coordinate geocodificate esiste un POI del DB (poiRepository.getNearbyPois)
   * si salva QUEL POI via favorites.ts (mai upsert diretto su saved_pois);
   * altrimenti la voce finisce nella wishlist esterna 'wip_reel_wishlist'.
   */
  const saveReelToFavorites = async () => {
    if (!reelResult || reelBusy) return;
    setReelBusy(true);
    try {
      let inFavorites = 0;
      let inWishlist = 0;
      let wishlist: any[] = [];
      try { wishlist = JSON.parse(localStorage.getItem(REEL_WISHLIST_KEY) || '[]'); } catch { wishlist = []; }
      if (!Array.isArray(wishlist)) wishlist = [];

      for (const idx of reelSelected) {
        const p = reelResult.places[idx];
        if (!p) continue;

        let matched: any = null;
        if (p.found && p.lat != null && p.lon != null) {
          try {
            const near = await getNearbyPois(p.lat, p.lon, 150);
            matched = (near || [])
              .filter((x: any) => x && x.lat != null && x.lon != null)
              .sort((a: any, b: any) => (a.distance_meters ?? 0) - (b.distance_meters ?? 0))[0] || null;
          } catch { matched = null; }
        }

        if (matched) {
          // toggleFavoritePoi è un toggle: si aggiunge SOLO se non è già
          // tra i preferiti (altrimenti lo toglieremmo).
          const already = getLocalFavorites().some((f: any) => String(f.poi_id || f.id) === String(matched.id));
          if (!already) await toggleFavoritePoi(matched);
          inFavorites++;
        } else {
          const key = `${p.name}|${p.city || ''}`.toLowerCase();
          if (!wishlist.some((w: any) => `${w?.name || ''}|${w?.city || ''}`.toLowerCase() === key)) {
            wishlist.push({ name: p.name, city: p.city || null, lat: p.lat ?? null, lon: p.lon ?? null, ts: Date.now() });
          }
          inWishlist++;
        }
      }

      while (wishlist.length > REEL_WISHLIST_MAX) wishlist.shift();
      try { localStorage.setItem(REEL_WISHLIST_KEY, JSON.stringify(wishlist)); } catch { /* storage pieno: pazienza */ }

      const parts: string[] = [];
      if (inFavorites > 0) parts.push(tr('vis_reel_in_favorites').replace('{n}', String(inFavorites)));
      if (inWishlist > 0) parts.push(tr('vis_reel_in_wishlist').replace('{n}', String(inWishlist)));
      if (parts.length > 0) notify(tr('vis_reel_saved').replace('{n}', parts.join(', ')), 'success');
      else notify(tr('vis_reel_select_one'));
    } finally {
      setReelBusy(false);
    }
  };

  /** 🗺 Centra la mappa sul luogo geocodificato (eventi esistenti di App/MapArea). */
  const showReelPlaceOnMap = (p: ReelPlace, idx: number) => {
    if (!p.found || p.lat == null || p.lon == null) return;
    // 'wip-open-map-area' porta alla tab mappa; 'focus-poi' (listener in
    // MapArea) centra e apre il popup. Il POI sintetico ha i soli campi che
    // focusPoiOnMap usa (id/name/lat/lon).
    window.dispatchEvent(new CustomEvent('wip-open-map-area'));
    window.dispatchEvent(new CustomEvent('focus-poi', {
      detail: { id: `reel-${idx}-${p.name}`, name: p.name, lat: p.lat, lon: p.lon, category: 'community', description_long: p.label || '' }
    }));
  };

  /**
   * ✨ Crea itinerario: salva i luoghi selezionati in 'wip_reel_to_plan' e
   * naviga alla tab Plan con l'evento esistente 'wip-itinerary-checkin'
   * (App.tsx → setActiveTab("plan")). Il prefill in PlanScreen è un aggancio
   * futuro: vedi il TODO sulla costante REEL_TO_PLAN_KEY.
   */
  const createReelItinerary = () => {
    if (!reelResult) return;
    const chosen = [...reelSelected].map(i => reelResult.places[i]).filter(Boolean);
    if (chosen.length === 0) { notify(tr('vis_reel_select_one')); return; }
    // Città prevalente tra i luoghi estratti (per il prefill destinazione).
    const cityCount: Record<string, number> = {};
    chosen.forEach(p => {
      const c = (p.city || '').trim();
      if (c) cityCount[c] = (cityCount[c] || 0) + 1;
    });
    const city = Object.entries(cityCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    try {
      localStorage.setItem(REEL_TO_PLAN_KEY, JSON.stringify({
        city,
        places: chosen.map(p => ({ name: p.name, lat: p.lat ?? null, lon: p.lon ?? null })),
        ts: Date.now()
      }));
    } catch { /* storage pieno: la navigazione resta valida */ }
    setReelResult(null);
    window.dispatchEvent(new CustomEvent('wip-itinerary-checkin', { detail: { poiId: 'reel-to-plan' } }));
  };

  // LA SCHEDA «SERVE IL PASS CON ITINERARIO», una sola (11/09/2026, dalle
  // foto del committente). Prima viveva solo nel modo Scansione, dove
  // stava sopra i due pass in vendita e offriva il pass da 150 due volte;
  // nel modo Visite non c'era affatto: si toccava un museo dell'elenco, il
  // server rispondeva «serve il pass» e sullo schermo non succedeva nulla.
  // Ora è una sola scheda, mostrata dove serve, e sotto di lei il pass da
  // 150 non si ripete.
  const schedaPassTour = pocheOpere && !visit ? (
    <div ref={schedaPassRef} className="w-full px-4 py-3 rounded-2xl border border-amber-300 bg-amber-50 text-left space-y-2">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-white border border-amber-200 flex items-center justify-center shrink-0">
          <Ticket className="w-5 h-5 text-amber-700" />
        </div>
        <div className="flex-1 min-w-0">
          {pocheOpere.nome && <p className="text-[9px] font-black uppercase tracking-[0.1em] text-amber-800 truncate">{pocheOpere.nome}</p>}
          <p className="text-xs font-black text-slate-900">{tr('mv_poche_opere_title')}</p>
          <p className="text-[10px] font-bold text-slate-600 leading-snug">
            {tr('mv_poche_opere_desc').replace('{s}', pocheOpere.nome || tr('mv_title')).replace('{n}', String(pocheOpere.opere)).replace('{p}', String(pocheOpere.prezzo))}
          </p>
        </div>
      </div>
      <button
        onClick={() => { setMode('vision'); setVisionTarget('artwork'); void openCamera(); }}
        className="w-full py-2.5 rounded-xl bg-primary text-white text-xs font-black active:scale-95 transition-transform flex items-center justify-center gap-2"
      >
        <Camera className="w-4 h-4" />{tr('mv_poche_opere_scansiona')} · {pocheOpere.prezzo} {getTranslation('credits_word', language)}
      </button>
    </div>
  ) : needsTourPass && !visit ? (
    <div ref={schedaPassRef} className="w-full px-4 py-3 rounded-2xl border-2 border-primary bg-white shadow-[0_12px_28px_rgba(30,58,138,0.12)] text-left space-y-2">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <Landmark className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          {/* Il museo toccato nell'elenco, per nome: la scheda deve dire DI
              CHI è il pass che chiede, altrimenti toccare «Palazzo delle
              Logge» e vedere la stessa scheda di prima è «non succede
              nulla» (12/09/2026, foto del committente). */}
          {passPerLuogo && <p className="text-[9px] font-black uppercase tracking-[0.1em] text-primary truncate">{passPerLuogo}</p>}
          <p className="text-xs font-black text-slate-900">{tr('mv_locked_title')}</p>
          <p className="text-[10px] font-bold text-slate-500 leading-snug">{tr('mv_locked_desc')}</p>
        </div>
      </div>
      {/* Prima la voce, poi la cassa: trenta secondi dell'introduzione di
          QUESTO museo, gratis. */}
      {passSample && (
        <button
          onClick={() => void toggleSample()}
          className="w-full py-2.5 rounded-xl bg-white border border-primary/40 text-primary text-xs font-black active:scale-95 transition-transform flex items-center justify-center gap-2"
        >
          {samplePlaying ? <X className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          {samplePlaying ? tr('mv_sample_stop') : tr('mv_sample_listen')}
        </button>
      )}
      <button
        onClick={() => { if (samplePlaying) { stopSpeech(); setSamplePlaying(false); } void handleBuyPass('tour'); }}
        disabled={buyingPass}
        className="w-full py-2.5 rounded-xl bg-primary text-white text-xs font-black active:scale-95 transition-transform disabled:opacity-50"
      >
        {buyingPass ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (
          passActive && passTier === 'base'
            ? `${tr('museum_pass_upgrade')} · +${Math.max(0, PRICING_LIST.museum_pass_tour - PRICING_LIST.museum_pass)} ${getTranslation('credits_word', language)}`
            : `${getTranslation('museum_pass_tour_title', language)} · ${PRICING_LIST.museum_pass_tour} ${getTranslation('credits_word', language)}`
        )}
      </button>
    </div>
  ) : null;

  return (
    /* TEMA CHIARO COME LE TAVOLE (10/09/2026, decisione del committente).
       Questa schermata era l'unica isola scura di un'app che è chiara da
       sempre (--color-background: #fdfbf7). Il nero aveva senso quando qui
       viveva solo il mirino; ora ci abitano tre sezioni di lettura — la
       scansione, il Radar AR e le Visite — e su fondo nero `text-secondary`
       vale ORO CHAMPAGNE (#d4af37), scelta buona per un mirino e pessima
       per un elenco di musei.
       Palette presa dalle tavole approvate, una per una: fondo #fdfbf7,
       schede bianche con bordo #e5e7eb, testo #0f172a/#64748b/#94a3b8,
       accento #1e3a8a, chiese in ambra #b45309. Sono i valori di
       slate-900/500/400, gray-200 e blue-50, quindi si scrivono con le
       classi di sempre invece che a mano.
       Resta nero SOLO il mirino a tutto schermo (in fondo al file): lì
       sotto scorre il video, e qualunque fondo chiaro sarebbe una cornice
       bianca attorno all'immagine. */
    <div className="flex-1 w-full h-full relative bg-background overflow-hidden flex flex-col font-sans">
      {quotaToast && <QuotaLimitToast feature={quotaToast} onClose={closeQuotaToast} />}

      {/* NON RICONOSCIUTA: È UNA DI QUESTE? Le opere del percorso con la foto,
          quelle della sala corrente per prime. Un tocco = opera spuntata e
          audioguida che parte. «Nessuna di queste» = la strada di sempre. */}
      {sceltaOpera && (() => {
        const v = getVisit();
        const tappe = v?.guide?.tappe || [];
        const salaQui = String(v?.salaCorrente || (() => { for (let i = tappe.length - 1; i >= 0; i--) { if (tappe[i].seenCardId && tappe[i].dove) return tappe[i].dove; } return ''; })() || '').trim();
        const ordinate = tappe.map((t, i) => ({ t, i })).filter(x => !x.t.soloCollezione)
          .sort((a, b) => Number(String(b.t.dove || '').trim() === salaQui) - Number(String(a.t.dove || '').trim() === salaQui));
        const scegli = (i: number) => {
          const t = tappe[i];
          markWorkSeen(t.nome, sceltaOpera.cardId);
          setSceltaOpera(null);
          const nuova = getVisit();
          if (nuova) { setVisit(nuova); setVisitOpen(true); }
          setTimeout(() => window.dispatchEvent(new CustomEvent('wip-museum-play-index', { detail: { index: i } })), 350);
        };
        return (
          <div className="fixed inset-0 z-[2650] bg-black/60 backdrop-blur-sm flex items-end sm:items-center sm:justify-center" onClick={() => setSceltaOpera(null)}>
            <div onClick={(e) => e.stopPropagation()} className="bg-[#fdfbf7] w-full sm:max-w-md max-h-[86vh] rounded-t-[2rem] sm:rounded-[2rem] overflow-hidden flex flex-col shadow-2xl">
              <div className="px-5 pt-5 pb-3 shrink-0">
                <p className="text-lg font-black text-slate-900 leading-tight">{tr('mv_pick_work')}</p>
                <p className="text-[11px] font-bold text-slate-500 mt-0.5">{tr('mv_pick_work_hint')}{salaQui ? ` · ${salaQui}` : ''}</p>
              </div>
              <div className="flex-1 overflow-y-auto px-5 pb-3">
                <div className="grid grid-cols-3 gap-2">
                  {ordinate.map(({ t, i }) => (
                    <button
                      key={`pick-${i}`}
                      onClick={() => scegli(i)}
                      className={`flex flex-col items-center gap-1.5 p-2 rounded-2xl bg-white border active:scale-95 transition-transform ${String(t.dove || '').trim() === salaQui && salaQui ? 'border-primary' : 'border-slate-200'}`}
                    >
                      {t.fotoIcona ? (
                        <img src={t.foto || t.fotoIcona} alt="" loading="lazy" className="w-full aspect-square rounded-xl object-cover border border-slate-200" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <div className="w-full aspect-square rounded-xl bg-blue-50 flex items-center justify-center"><Landmark className="w-6 h-6 text-primary" /></div>
                      )}
                      <span className="text-[10px] font-black text-slate-800 leading-tight text-center line-clamp-2">{t.nome}</span>
                      {t.dove && <span className="text-[9px] font-bold text-slate-500 truncate max-w-full">{t.dove}</span>}
                    </button>
                  ))}
                </div>
              </div>
              <div className="px-5 pb-5 pt-2 shrink-0">
                <button
                  onClick={() => { const s = sceltaOpera; setSceltaOpera(null); setCommentCard({ cardId: s.cardId, image: s.image, refunded: s.refunded }); }}
                  className="w-full py-3 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold text-[13px] active:scale-[0.98] transition-transform"
                >
                  {tr('mv_pick_none')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Prima card guidata: overlay una-tantum al primo ingresso in camera */}
      <AnimatePresence>
        {showFirstGuide && mode === 'vision' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <div className="w-full max-w-sm bg-white border border-gray-200 rounded-3xl p-6 space-y-4 text-slate-900 shadow-[0_24px_48px_rgba(15,23,42,0.18)]">
              <h3 className="text-lg font-black text-center">{tr('vis_first_title')}</h3>
              <div className="space-y-3">
                {(['vis_first_step1', 'vis_first_step2', 'vis_first_step3'] as const).map((key, i) => (
                  <div key={key} className="flex items-start gap-3">
                    <span className="w-7 h-7 shrink-0 rounded-full bg-primary text-white flex items-center justify-center text-xs font-black">{i + 1}</span>
                    <p className="text-sm text-slate-600">{tr(key)}</p>
                  </div>
                ))}
              </div>
              {nearbySuggestion && (
                <div className="bg-blue-50 border border-primary/30 rounded-2xl px-4 py-3 text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">{tr('vis_first_nearby')}</p>
                  <p className="text-sm font-black text-primary">{nearbySuggestion.name} <span className="font-bold text-slate-500">~{nearbySuggestion.dist} m</span></p>
                </div>
              )}
              <button
                onClick={dismissFirstGuide}
                className="w-full py-3 bg-primary rounded-2xl font-black text-sm uppercase tracking-widest active:scale-95 transition-transform"
              >
                {tr('vis_first_cta')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {onClose && mode !== 'ar' && (
        // Allineata alla stessa quota della X di Radar AR (top-0 + p-4): prima
        // stava più in basso (top-6), sola, senza nessuna barra a fianco —
        // qui non c'è una testata come nell'AR, ma la X deve comunque cadere
        // alla stessa altezza quando si passa da un modo all'altro (11/09/2026).
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-40 w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-slate-900 active:scale-90 transition-transform shadow-[0_1px_3px_rgba(15,23,42,0.08)] cursor-pointer hover:bg-gray-50"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      {/* Sfondo decorativo. Su nero due macchie al 40% erano un alone; su
          panna la stessa intensità sporca il foglio e fa sembrare sbiadito
          il testo. Restano, molto più tenui: danno profondità al fondo senza
          entrare in concorrenza con le schede bianche. */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.55]">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/[0.07] rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#d4af37]/[0.07] rounded-full blur-[100px]" />
      </div>

      {/* pt-20: sotto la X in alto a destra (top-4 + 40 px) non deve finire
          niente. Nel modo Scansione il contenuto è alto e il selettore dei
          tre modi saliva fin sotto la X, che copriva «Visite».
          SCORREVOLE (11/09/2026): prima il contenitore era `overflow-hidden`
          col genitore e centrato in verticale — con più di una schermata di
          contenuto (Pass Museo, elenco "qui vicino"...) il resto restava
          semplicemente tagliato fuori, senza modo di raggiungerlo. `justify-
          center` con overflow-y-auto rende irraggiungibile la PARTE ALTA del
          contenuto quando supera l'altezza dello schermo (bug noto dei
          browser); si allinea in alto e si lascia che sia il contenuto breve
          a restare centrato "a vista" grazie al padding, non al centraggio
          flex.
          min-h-0 (12/09/2026, foto del committente: nel modo Opera il pass da
          150 restava tagliato in fondo e la pagina non scorreva): un figlio
          flex ha min-height:auto, quindi cresceva quanto il contenuto e a
          tagliare era l'overflow-hidden del genitore — overflow-y-auto qui
          non aveva mai niente da far scorrere. */}
      <div className="flex-1 min-h-0 relative flex flex-col items-center px-8 pb-8 pt-20 z-10 overflow-y-auto overscroll-contain">
        {mode === 'vision' ? (
          <>
            {/* I TRE MODI DI WIP VISION (10/09/2026): scansione, radar e le
                VISITE dentro musei e chiese. La sezione musei sta qui, non in
                una tab nuova: la barra in basso è già piena. */}
            <div className="w-full flex bg-white rounded-2xl p-1 border border-gray-200 shadow-[0_1px_3px_rgba(15,23,42,0.06)] gap-0.5 mb-8 max-w-xs">
              <button
                onClick={() => setMode('vision')}
                className={`flex-1 py-2.5 text-[11px] font-black rounded-xl transition-all ${mode === 'vision' ? 'bg-primary text-white shadow-[0_4px_12px_rgba(30,58,138,0.25)]' : 'text-slate-500 hover:text-slate-900'}`}
              >
                {tr('vis_tab_scan')}
              </button>
              <button
                onClick={() => setMode('ar')}
                className={`flex-1 py-2.5 text-[11px] font-black rounded-xl transition-all ${mode === 'ar' ? 'bg-primary text-white shadow-[0_4px_12px_rgba(30,58,138,0.25)]' : 'text-slate-500 hover:text-slate-900'}`}
              >
                {tr('vis_tab_ar')}
              </button>
              <button
                onClick={() => { setMode('visite'); void caricaMuseiVicini(); }}
                className={`flex-1 py-2.5 text-[11px] font-black rounded-xl transition-all ${mode === 'visite' ? 'bg-primary text-white shadow-[0_4px_12px_rgba(30,58,138,0.25)]' : 'text-slate-500 hover:text-slate-900'}`}
              >
                {tr('vis_tab_visite')}
              </button>
            </div>

            <div className="w-24 h-24 bg-blue-50 rounded-[2.5rem] flex items-center justify-center mb-8 border border-[#dbe4f5] shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
              <Search className="w-12 h-12 text-primary" />
            </div>

        <h2 className="text-3xl font-black text-slate-900 text-center mb-4 tracking-tight">
          {tr('vis_title')}
        </h2>
        <p className="text-xs text-slate-500 font-medium max-w-[200px] text-center mx-auto">
          {visionTarget === 'artwork'
            ? tr('vis_hint_artwork')
            : visionTarget === 'nature'
            ? tr('vis_hint_nature')
            : tr('vis_hint_place')}
        </p>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          {/* Coda Vision offline: foto scattate senza rete, in attesa */}
          {queueCount > 0 && (
            <div className="w-full px-4 py-3 rounded-2xl border border-sky-200 bg-sky-50 text-left">
              <p className="text-xs font-black text-sky-800">
                {(queueProcessing ? tr('vis_queue_processing') : tr('vis_queue_waiting')).replace('{n}', String(queueCount))}
              </p>
            </div>
          )}
          {/* Selettore modalità: Luogo / Opera (ondata 7) / Natura.
              La modalità "Screenshot" (da reel a itinerario) e' stata tolta
              dall'interfaccia il 22/08/2026 per decisione del committente: il
              ramo analyzeScreenshot e la rotta server restano, ma senza
              questo pulsante non si raggiungono. */}
          <div className="w-full flex items-center gap-0.5 p-1 bg-white border border-gray-200 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
            {([
              { key: 'place', label: tr('vis_mode_place') },
              { key: 'artwork', label: tr('vis_mode_artwork') },
              { key: 'nature', label: tr('vis_mode_nature') },
            ] as const).map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setVisionTarget(opt.key)}
                aria-pressed={visionTarget === opt.key}
                className={`flex-1 py-2.5 px-0.5 rounded-xl text-[11px] font-black transition-all active:scale-95 ${
                  visionTarget === opt.key ? 'bg-primary text-white shadow-[0_4px_12px_rgba(30,58,138,0.25)]' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={openCamera}
            disabled={isScanning}
            className="w-full flex items-center justify-center gap-3 py-4 bg-primary text-white font-black text-base rounded-2xl shadow-[0_12px_28px_rgba(30,58,138,0.25)] active:scale-95 transition-all hover:bg-primary/90 disabled:opacity-50 disabled:active:scale-100"
          >
            <Camera className="w-5 h-5" />
            <span>{tr('vis_take_photo')}</span>
          </button>

          <button
            onClick={() => galleryInputRef.current?.click()}
            disabled={isScanning}
            className="w-full flex items-center justify-center gap-3 py-4 bg-white text-slate-900 font-black text-base rounded-2xl border border-gray-200 shadow-[0_1px_3px_rgba(15,23,42,0.06)] active:scale-95 transition-all hover:bg-gray-50 disabled:opacity-50 disabled:active:scale-100"
          >
            <ImageIcon className="w-5 h-5" />
            <span>{tr('vis_pick_gallery')}</span>
          </button>

          {/* VISITA GUIDATA — WIP capisce dove sei (GPS + opera riconosciuta)
              e ti accompagna nel museo o nella chiesa con un percorso. */}
          {(visionTarget === 'artwork' || passActive || visit) && (
            (needsTourPass || pocheOpere) && !visit ? (
              // Il server ha detto che il percorso è del pass con itinerario.
              schedaPassTour
            ) : visit ? (
              <button
                onClick={() => setVisitOpen(true)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 border-primary bg-white shadow-[0_12px_28px_rgba(30,58,138,0.12)] text-left active:scale-95 transition-all"
              >
                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <Landmark className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-slate-900 truncate">{tr('mv_title')} · {visit.venue.name}</p>
                  <p className="text-[10px] font-bold text-slate-500">
                    {tr('mv_seen_count').replace('{n}', String(countSeen(visit))).replace('{t}', String(visit.guide.tappe.length))} · {tr('mv_open')}
                  </p>
                </div>
              </button>
            ) : visitNameFallback !== null ? (
              <form
                onSubmit={(e) => { e.preventDefault(); void startGuidedVisit(visitNameFallback); }}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] text-left space-y-2"
              >
                <p className="text-[11px] font-bold text-slate-600 leading-snug">{tr('mv_ask_name')}</p>
                <div className="flex gap-2">
                  <input
                    value={visitNameFallback}
                    onChange={(e) => setVisitNameFallback(e.target.value)}
                    placeholder={tr('mv_name_placeholder')}
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-primary"
                  />
                  <button type="submit" disabled={visitStarting || visitNameFallback.trim().length < 3} className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-black disabled:opacity-50">
                    {visitStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : tr('mv_go')}
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => void startGuidedVisit()}
                disabled={isScanning || visitStarting}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 border-primary bg-white shadow-[0_12px_28px_rgba(30,58,138,0.12)] text-left active:scale-95 transition-all hover:bg-blue-50/40 disabled:opacity-50"
              >
                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  {visitStarting ? <Loader2 className="w-5 h-5 text-primary animate-spin" /> : <Landmark className="w-5 h-5 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-slate-900">{tr('mv_start')}</p>
                  <p className="text-[10px] font-bold text-slate-500 leading-snug">{tr('mv_start_desc')}</p>
                </div>
              </button>
            )
          )}

          {/* PASS MUSEO — dentro un museo il geofencing tace per design:
              l'esperienza indoor è inquadrare le opere. Due livelli: base
              (40 audioguide) e con itinerario (anche la visita guidata). */}
          {passActive && passExpiresAt !== null ? (
            <div className="w-full flex flex-col gap-2">
              <div className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-[#d4af37] bg-[#f8f5f0] shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
                <div className="w-9 h-9 rounded-xl bg-white border border-[#e8dfc9] flex items-center justify-center shrink-0">
                  <Ticket className="w-5 h-5 text-amber-700" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-black text-amber-800">
                    {getTranslation("museum_pass_active", language)}
                    {passTier === 'tour' ? ` · ${getTranslation("museum_pass_tour_badge", language)}` : ''}
                  </p>
                  <p className="text-[10px] font-bold text-amber-700/80">
                    {tr('museum_pass_scans_left').replace('{n}', String(Math.max(0, passScans.limit - passScans.used))).replace('{t}', String(passScans.limit))} · {getTranslation("museum_pass_remaining", language)} {formatPassRemaining(passExpiresAt)}
                  </p>
                </div>
              </div>
              {/* Pass base attivo: si sale a "con itinerario" pagando la differenza. */}
              {passTier === 'base' && (
                <button
                  onClick={() => void handleBuyPass('tour')}
                  disabled={isScanning || buyingPass}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 border-primary bg-white shadow-[0_12px_28px_rgba(30,58,138,0.12)] active:scale-95 transition-all disabled:opacity-50"
                >
                  <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                    {buyingPass ? <Loader2 className="w-5 h-5 text-primary animate-spin" /> : <Landmark className="w-5 h-5 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-xs font-black text-slate-900">
                      {tr('museum_pass_upgrade')} · +{Math.max(0, PRICING_LIST.museum_pass_tour - PRICING_LIST.museum_pass)} {getTranslation("credits_word", language)}
                    </p>
                    <p className="text-[10px] font-bold text-slate-500 leading-snug">{tr('museum_pass_upgrade_desc')}</p>
                  </div>
                </button>
              )}
            </div>
          ) : (
            <div className="w-full flex flex-col gap-2">
              <button
                onClick={() => void handleBuyPass('base')}
                disabled={isScanning || buyingPass}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-gray-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] active:scale-95 transition-all hover:bg-[#f8f5f0] disabled:opacity-50 disabled:active:scale-100"
              >
                <div className="w-9 h-9 rounded-xl bg-[#f8f5f0] flex items-center justify-center shrink-0">
                  {buyingPass ? <Loader2 className="w-5 h-5 text-amber-700 animate-spin" /> : <Ticket className="w-5 h-5 text-amber-700" />}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-black text-slate-900">
                    {getTranslation("museum_pass_title", language)} · {PRICING_LIST.museum_pass} {getTranslation("credits_word", language)}
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 leading-snug">{getTranslation("museum_pass_desc", language)}</p>
                </div>
              </button>
              {/* Il pass da 150 NON si ripete quando la scheda «serve il
                  pass» qui sopra lo sta già offrendo — e quella scheda, in
                  questo modo, esiste SOLO con «Opera» selezionato. Prima la
                  condizione ignorava il modo: dopo un «serve il pass» arrivato
                  dalla tab Visite, in «Luogo» e «Natura» sparivano ENTRAMBE le
                  offerte da 150 (12/09/2026, foto del committente: solo il
                  pass da 100 sotto «Scatta foto»). */}
              {!(needsTourPass && !visit && visionTarget === 'artwork') && (
              <button
                onClick={() => void handleBuyPass('tour')}
                disabled={isScanning || buyingPass}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 border-primary bg-white shadow-[0_12px_28px_rgba(30,58,138,0.12)] active:scale-95 transition-all hover:bg-blue-50/40 disabled:opacity-50 disabled:active:scale-100"
              >
                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  {buyingPass ? <Loader2 className="w-5 h-5 text-primary animate-spin" /> : <Landmark className="w-5 h-5 text-primary" />}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-black text-slate-900">
                    {getTranslation("museum_pass_tour_title", language)} · {PRICING_LIST.museum_pass_tour} {getTranslation("credits_word", language)}
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 leading-snug">{getTranslation("museum_pass_tour_desc", language)}</p>
                </div>
              </button>
              )}
            </div>
          )}
        </div>
        </>
        ) : mode === 'visite' ? (
          /* ── SEZIONE VISITE: musei e chiese ────────────────────────────── */
          <div className="w-full max-w-xs flex flex-col gap-3">
            <div className="w-full flex bg-white rounded-2xl p-1 border border-gray-200 shadow-[0_1px_3px_rgba(15,23,42,0.06)] gap-0.5">
              <button onClick={() => setMode('vision')} className="flex-1 py-2.5 text-[11px] font-black rounded-xl text-slate-500 hover:text-slate-900 transition-colors">{tr('vis_tab_scan')}</button>
              <button onClick={() => setMode('ar')} className="flex-1 py-2.5 text-[11px] font-black rounded-xl text-slate-500 hover:text-slate-900 transition-colors">{tr('vis_tab_ar')}</button>
              <button className="flex-1 py-2.5 text-[11px] font-black rounded-xl bg-primary text-white shadow-[0_4px_12px_rgba(30,58,138,0.25)]">{tr('vis_tab_visite')}</button>
            </div>

            {/* Visita in corso: si riprende da dove si era rimasti */}
            {visit && (
              <button
                onClick={() => setVisitOpen(true)}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-3xl border-2 border-primary bg-white shadow-[0_12px_28px_rgba(30,58,138,0.12)] text-left active:scale-95 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <Landmark className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.1em] text-primary">{tr('mv_title')}</p>
                  <p className="text-[19px] leading-tight font-black text-slate-900 truncate">{visit.venue.name}</p>
                  <p className="text-[11px] font-bold text-slate-500">
                    {tr('mv_seen_count').replace('{n}', String(countSeen(visit))).replace('{t}', String(visit.guide.tappe.length))}
                  </p>
                </div>
              </button>
            )}

            {/* Sei qui: il luogo riconosciuto dalla posizione */}
            {!visit && (
              <button
                onClick={() => void startGuidedVisit()}
                disabled={visitStarting}
                className="w-full flex items-center gap-3 px-4 py-4 rounded-3xl border-2 border-primary bg-white shadow-[0_12px_28px_rgba(30,58,138,0.12)] text-left active:scale-95 transition-all disabled:opacity-50"
              >
                {/* La foto del luogo riconosciuto dal GPS, nel cerchio; il
                    simbolo se non c'è ancora (o non c'è nessun museo vicino). */}
                {seiQui?.photoIcon && !visitStarting ? (
                  <img src={seiQui.photoIcon} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} className="w-10 h-10 rounded-full object-cover shrink-0 border border-gray-200" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                    {visitStarting ? <Loader2 className="w-5 h-5 text-primary animate-spin" /> : <Landmark className="w-5 h-5 text-primary" />}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {seiQui ? (
                    <>
                      <p className="text-[9px] font-black uppercase tracking-[0.1em] text-primary">{tr('mv_you_are_at')}</p>
                      <p className="text-[17px] leading-tight font-black text-slate-900 truncate">{seiQui.name}</p>
                      <p className="text-[10px] font-bold text-slate-500 leading-snug">{tr('mv_start_here')}{seiQui.inLibrary ? ` · ${tr('mv_con_sale')}` : ''}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-black text-slate-900">{tr('mv_start')}</p>
                      <p className="text-[10px] font-bold text-slate-500 leading-snug">{tr('mv_start_desc')}</p>
                    </>
                  )}
                </div>
              </button>
            )}

            {/* «Serve il pass»: anche qui, altrimenti toccare un museo
                dell'elenco non fa succedere niente sullo schermo. */}
            {schedaPassTour}

            {/* PASS MUSEO — prima c'era solo nella tab "Scansione AI": qui in
                "Visite" si vedeva SOLO l'offerta da 150 crediti (dentro
                schedaPassTour, e solo quando un museo la richiedeva), mai
                l'opzione base da 100 senza percorso (11/09/2026, segnalazione
                utente). */}
            {passActive && passExpiresAt !== null ? (
              <div className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-[#d4af37] bg-[#f8f5f0] shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
                <div className="w-9 h-9 rounded-xl bg-white border border-[#e8dfc9] flex items-center justify-center shrink-0">
                  <Ticket className="w-5 h-5 text-amber-700" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-black text-amber-800">
                    {getTranslation("museum_pass_active", language)}
                    {passTier === 'tour' ? ` · ${getTranslation("museum_pass_tour_badge", language)}` : ''}
                  </p>
                  <p className="text-[10px] font-bold text-amber-700/80">
                    {tr('museum_pass_scans_left').replace('{n}', String(Math.max(0, passScans.limit - passScans.used))).replace('{t}', String(passScans.limit))} · {getTranslation("museum_pass_remaining", language)} {formatPassRemaining(passExpiresAt)}
                  </p>
                </div>
                {passTier === 'base' && (
                  <button
                    onClick={() => void handleBuyPass('tour')}
                    disabled={buyingPass}
                    className="shrink-0 px-3 py-2 rounded-xl bg-primary text-white text-[11px] font-black disabled:opacity-50"
                  >
                    {buyingPass ? <Loader2 className="w-4 h-4 animate-spin" /> : tr('museum_pass_upgrade')}
                  </button>
                )}
              </div>
            ) : (
              <div className="w-full flex flex-col gap-2">
                <button
                  onClick={() => void handleBuyPass('base')}
                  disabled={buyingPass}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-gray-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] active:scale-95 transition-all hover:bg-[#f8f5f0] disabled:opacity-50"
                >
                  <div className="w-9 h-9 rounded-xl bg-[#f8f5f0] flex items-center justify-center shrink-0">
                    {buyingPass ? <Loader2 className="w-5 h-5 text-amber-700 animate-spin" /> : <Ticket className="w-5 h-5 text-amber-700" />}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-xs font-black text-slate-900">
                      {getTranslation("museum_pass_title", language)} · {PRICING_LIST.museum_pass} {getTranslation("credits_word", language)}
                    </p>
                    <p className="text-[10px] font-bold text-slate-500 leading-snug">{getTranslation("museum_pass_desc", language)}</p>
                  </div>
                </button>
                {/* Il pass da 150 NON si ripete quando la scheda "serve il
                    pass" qui sopra lo sta già offrendo. */}
                {!(needsTourPass && !visit) && (
                  <button
                    onClick={() => void handleBuyPass('tour')}
                    disabled={buyingPass}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 border-primary bg-white shadow-[0_12px_28px_rgba(30,58,138,0.12)] active:scale-95 transition-all hover:bg-blue-50/40 disabled:opacity-50"
                  >
                    <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                      {buyingPass ? <Loader2 className="w-5 h-5 text-primary animate-spin" /> : <Landmark className="w-5 h-5 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-xs font-black text-slate-900">
                        {getTranslation("museum_pass_tour_title", language)} · {PRICING_LIST.museum_pass_tour} {getTranslation("credits_word", language)}
                      </p>
                      <p className="text-[10px] font-bold text-slate-500 leading-snug">{getTranslation("museum_pass_tour_desc", language)}</p>
                    </div>
                  </button>
                )}
              </div>
            )}

            {/* Ricerca: qualsiasi museo o chiesa del mondo */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                // Invio: il primo suggerimento se c'è (è già il migliore),
                // altrimenti il nome scritto, come prima.
                if (suggerimenti && suggerimenti.length > 0) scegliSuggerimento(suggerimenti[0]);
                else if (cercaMuseo.trim().length >= 3) void startGuidedVisit(cercaMuseo.trim());
              }}
              className="w-full flex gap-2"
            >
              <input
                value={cercaMuseo}
                onChange={(e) => onCercaMuseo(e.target.value)}
                placeholder={tr('mv_cerca_luogo')}
                autoComplete="off"
                autoCorrect="off"
                className="flex-1 min-w-0 px-3.5 py-2.5 rounded-2xl bg-white border border-gray-200 text-[13px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-primary"
              />
              <button type="submit" disabled={visitStarting || cercaMuseo.trim().length < 3} className="px-3.5 rounded-2xl bg-primary text-white disabled:opacity-40">
                <Search className="w-4 h-4" />
              </button>
            </form>

            {/* I SUGGERIMENTI: guide pronte con la spunta, poi i musei
                dell'archivio e le voci Wikipedia («si prepara al momento»).
                Un tocco apre la visita con lo stesso gesto dell'elenco. */}
            {cercaMuseo.trim().length >= 2 && (suggerendo || suggerimenti !== null) && (
              <div className="w-full -mt-1 rounded-2xl bg-white border border-gray-200 shadow-[0_8px_24px_rgba(15,23,42,0.08)] overflow-hidden">
                {suggerendo && !(suggerimenti && suggerimenti.length) ? (
                  <div className="flex items-center justify-center py-3"><Loader2 className="w-4 h-4 text-primary animate-spin" /></div>
                ) : suggerimenti && suggerimenti.length === 0 ? (
                  <p className="text-[11px] font-bold text-slate-400 leading-snug px-3.5 py-3">{tr('mv_sugg_nessuno')}</p>
                ) : (
                  <div className="max-h-[36vh] overflow-y-auto divide-y divide-gray-100">
                    {(suggerimenti || []).map(s => {
                      const chiesa = s.venue_type === 'chiesa';
                      return (
                        <button
                          key={s.venue_key}
                          type="button"
                          onClick={() => scegliSuggerimento(s)}
                          disabled={visitStarting}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left active:bg-blue-50/60 transition-colors disabled:opacity-50"
                        >
                          {s.venue_photo_icon ? (
                            <img src={s.venue_photo_icon} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} className="w-8 h-8 rounded-full object-cover shrink-0 border border-gray-200" />
                          ) : (
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${chiesa ? 'bg-[#f8f5f0]' : 'bg-blue-50'}`}>
                              <Landmark className={`w-4 h-4 ${chiesa ? 'text-amber-700' : 'text-primary'}`} />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-black text-slate-900 truncate">{s.venue_name}</p>
                            <p className="text-[11px] font-bold text-slate-500 truncate">
                              {s.kind === 'library'
                                ? `${tr('mv_sugg_pronta')} · ${tr('mv_n_opere').replace('{n}', String(s.stops_count))}${s.subtitle ? ` · ${s.subtitle}` : ''}`
                                : (s.subtitle || tr('mv_sugg_genera'))}
                            </p>
                          </div>
                          {s.kind === 'library' && <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 shrink-0">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* LE TUE VISITE: già pagate, si riaprono gratis e senza rete */}
            {visiteSalvate.length > 0 && (
              <div className="w-full">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 mb-2">{tr('mv_le_tue_visite')}</p>
                <div className="space-y-2 max-h-[26vh] overflow-y-auto">
                  {visiteSalvate.map(a => (
                    <button
                      key={`${a.venueKey}-${a.language}`}
                      onClick={() => riapriConservata(a)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white border border-gray-200 shadow-[0_1px_3px_rgba(15,23,42,0.06)] text-left active:scale-95 transition-all"
                    >
                      {a.venuePhotoIcon ? (
                        <img
                          src={a.venuePhotoIcon}
                          alt=""
                          loading="lazy"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          className="w-9 h-9 rounded-full object-cover shrink-0 border border-gray-200"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                          <Landmark className="w-4 h-4 text-primary" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-black text-slate-900 truncate">{a.venueName}</p>
                        <p className="text-[11px] font-bold text-slate-500">
                          {tr('mv_n_opere').replace('{n}', String(a.guide?.tappe?.length || 0))}
                          {opereInArchivio(a.venueKey, language) > 0
                            ? ` · ${tr('mv_audioguide_tue').replace('{n}', String(opereInArchivio(a.venueKey, language)))}`
                            : ''}
                        </p>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 shrink-0">{tr('mv_gia_tua')}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Qui vicino, già pronti */}
            <div className="w-full">
              <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 mb-2">{tr('mv_qui_vicino')}</p>
              {museiVicini === null ? (
                <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
              ) : museiVicini.length === 0 ? (
                <p className="text-[11px] font-bold text-slate-400 leading-snug py-2">{tr('mv_nessuno_vicino')}</p>
              ) : (
                <div className="space-y-2 max-h-[38vh] overflow-y-auto">
                  {museiVicini.map(m => {
                    const chiesa = m.venue_type === 'chiesa';
                    return (
                    <button
                      key={m.venue_key}
                      onClick={() => void apriVisitaDiElenco(m)}
                      disabled={visitStarting}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white border border-gray-200 shadow-[0_1px_3px_rgba(15,23,42,0.06)] text-left active:scale-95 transition-all disabled:opacity-50"
                    >
                      {/* La FOTO del luogo nel cerchio, come per le opere. Se il
                          museo non ne ha una dichiarata resta il simbolo: mai
                          la foto di un altro posto, mai una foto "a tema".
                          Mentre QUESTA riga genera la guida, lo spinner
                          sostituisce foto/simbolo: è l'unico segnale che il
                          tocco ha funzionato, la guida può volerci un minuto. */}
                      {avviandoKey === m.venue_key ? (
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${chiesa ? 'bg-[#f8f5f0]' : 'bg-blue-50'}`}>
                          <Loader2 className={`w-4 h-4 animate-spin ${chiesa ? 'text-amber-700' : 'text-primary'}`} />
                        </div>
                      ) : m.venue_photo_icon ? (
                        <img
                          src={m.venue_photo_icon}
                          alt=""
                          loading="lazy"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          className="w-9 h-9 rounded-full object-cover shrink-0 border border-gray-200"
                        />
                      ) : (
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${chiesa ? 'bg-[#f8f5f0]' : 'bg-blue-50'}`}>
                          <Landmark className={`w-4 h-4 ${chiesa ? 'text-amber-700' : 'text-primary'}`} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-black text-slate-900 truncate">{m.venue_name}</p>
                        <p className="text-[11px] font-bold text-slate-500">
                          {/* Museo dell'archivio senza guida: «si prepara al
                              momento», non «0 opere». */}
                          {m.kind === 'poi' || !(m.stops_count > 0)
                            ? tr('mv_sugg_genera')
                            : tr('mv_n_opere').replace('{n}', String(m.stops_count))}
                          {m.stops_with_room > 0 ? ` · ${tr('mv_con_sale')}` : ''}
                        </p>
                      </div>
                      {m.distance_m != null && (
                        <span className="text-[11px] font-black text-slate-400 shrink-0">
                          {m.distance_m >= 1000 ? `${(m.distance_m / 1000).toFixed(1)} km` : `${m.distance_m} m`}
                        </span>
                      )}
                    </button>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="text-[10px] font-bold text-slate-400 text-center leading-relaxed">{tr('mv_promessa')}</p>
          </div>
        ) : (
          <AROverlay
            onClose={() => setMode('vision')}
            onPoiClick={(poi) => {
              // Passa il POI al parent (App.tsx) che aprirà la scheda.
              // Formattiamo il dato come se fosse stato riconosciuto
              onRecognize({ ...poi, riconosciuto: true, spiegazione_audio: poi.summary || poi.description_long || getTranslation('vr_b_ar_explore', language) });
            }} 
          />
        )}

        {/* Error/Analysis Modal Overlay */}
        <AnimatePresence>
          {(isScanning || error) && (
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="absolute inset-0 z-30 bg-black/80 backdrop-blur-md flex items-center justify-center p-8"
            >
              <div className="w-full max-w-xs bg-[#151619] border border-white/10 rounded-[2.5rem] p-6 text-center shadow-2xl">
                 {isScanning ? (
                   <>
                     {previewImage ? (
                       /* Mirino stile AR: la foto scattata con angoli e linea di scansione */
                       <div className="relative w-full aspect-square rounded-3xl overflow-hidden mb-5 bg-black">
                         <img src={previewImage} alt="" className="w-full h-full object-cover opacity-80" />
                         <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/40" />
                         {[
                           'top-3 left-3 border-t-2 border-l-2 rounded-tl-xl',
                           'top-3 right-3 border-t-2 border-r-2 rounded-tr-xl',
                           'bottom-3 left-3 border-b-2 border-l-2 rounded-bl-xl',
                           'bottom-3 right-3 border-b-2 border-r-2 rounded-br-xl',
                         ].map((pos) => (
                           <div key={pos} className={`absolute w-7 h-7 border-primary ${pos}`} />
                         ))}
                         <motion.div
                           animate={{ top: ['10%', '86%', '10%'] }}
                           transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                           className="absolute left-5 right-5 h-[2px] rounded-full bg-primary shadow-[0_0_14px_3px_rgba(var(--color-primary),0.55)]"
                         />
                         {passActive && (
                           <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-400/20 backdrop-blur-md border border-amber-400/40">
                             <Ticket className="w-3 h-3 text-amber-300" />
                             <span className="text-[9px] font-black text-amber-200 whitespace-nowrap">{getTranslation("museum_pass_active", language)}</span>
                           </div>
                         )}
                       </div>
                     ) : (
                       <div className="w-20 h-20 mx-auto mb-6 relative">
                         <div className="absolute inset-0 border-2 border-primary/20 rounded-full animate-ping"></div>
                         <div className="w-full h-full bg-primary/10 rounded-full flex items-center justify-center">
                           <Loader2 className="w-10 h-10 text-primary animate-spin" />
                         </div>
                       </div>
                     )}
                     <h3 className="text-secondary font-black text-xl mb-2">{getTranslation("camera_scanning", language)}</h3>
                     <p className="text-secondary/60 text-sm font-medium tracking-tight">{getTranslation("camera_scanning_desc", language)}</p>
                   </>
                 ) : (
                   <>
                     <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/20">
                       <X className="w-8 h-8 text-red-500" />
                     </div>
                     <h3 className="text-secondary font-black text-xl mb-3">{getTranslation("camera_error_title", language)}</h3>
                     <p className="text-secondary/60 text-sm font-bold leading-relaxed mb-8">{error}</p>
                     <button 
                       onClick={() => setError('')}
                       className="w-full py-3 bg-surface/10 text-secondary font-black text-sm rounded-2xl hover:bg-surface/20 transition-colors"
                     >
                       {getTranslation("camera_retry", language)}
                     </button>
                   </>
                 )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* MODAL CREDITI */}
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

      {/* Sheet «Luoghi trovati» — «Da reel a itinerario» (📱 Screenshot) */}
      <AnimatePresence>
        {reelResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-end justify-center"
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
              className="w-full max-w-md bg-[#111827] border-t border-x border-white/15 rounded-t-3xl p-5 pb-8 text-white shadow-2xl max-h-[80%] flex flex-col"
            >
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="min-w-0">
                  <h3 className="text-lg font-black">{tr('vis_reel_title')}</h3>
                  {reelResult.sourceHint ? (
                    <p className="text-[11px] font-bold text-white/50 truncate">{reelResult.sourceHint}</p>
                  ) : null}
                </div>
                <button
                  onClick={() => setReelResult(null)}
                  aria-label={tr('vis_close')}
                  className="w-9 h-9 shrink-0 rounded-full bg-surface/10 border border-white/15 flex items-center justify-center active:scale-90 transition-transform"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[11px] font-bold text-white/40 mb-3">{tr('vis_reel_desc')}</p>

              {/* Checklist: nome, città, ✓ trovato sulla mappa / ⚠ non trovato */}
              <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-2 mb-4">
                {reelResult.places.map((p, idx) => (
                  <div key={`${idx}-${p.name}`} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-surface/10 border border-white/10">
                    <input
                      type="checkbox"
                      checked={reelSelected.has(idx)}
                      onChange={() => setReelSelected(prev => {
                        const next = new Set(prev);
                        if (next.has(idx)) next.delete(idx); else next.add(idx);
                        return next;
                      })}
                      className="w-4 h-4 shrink-0 accent-[rgb(var(--color-primary))]"
                      aria-label={p.name}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black truncate">{p.name}</p>
                      <p className="text-[11px] font-bold text-white/50 truncate">
                        {p.city ? `${p.city} · ` : ''}
                        {p.found ? tr('vis_reel_found') : tr('vis_reel_not_found')}
                      </p>
                    </div>
                    {p.found && p.lat != null && p.lon != null && (
                      <button
                        onClick={() => showReelPlaceOnMap(p, idx)}
                        className="shrink-0 px-2.5 py-2 rounded-xl bg-surface/10 border border-white/15 text-sm active:scale-90 transition-transform"
                        aria-label={`${tr('vis_open_on_map')}: ${p.name}`}
                        title={tr('vis_open_on_map')}
                      >
                        🗺
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-2.5">
                <button
                  onClick={saveReelToFavorites}
                  disabled={reelBusy || reelSelected.size === 0}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-surface/10 border border-white/15 rounded-2xl font-black text-sm active:scale-95 transition-all hover:bg-surface/20 disabled:opacity-50 disabled:active:scale-100"
                >
                  {reelBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>💛</span>}
                  <span>{tr('vis_reel_save')}</span>
                </button>
                <button
                  onClick={createReelItinerary}
                  disabled={reelBusy || reelSelected.size === 0}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary rounded-2xl font-black text-sm uppercase tracking-wide active:scale-95 transition-all hover:bg-primary/90 disabled:opacity-50 disabled:active:scale-100"
                >
                  {tr('vis_reel_create')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Foto dalla galleria senza GPS EXIF: «Dove hai scattato questa foto?» */}
      {locationPicker && (
        <VisionLocationPicker
          devicePosition={locationPicker.device}
          language={language}
          onPick={onLocationPicked}
        />
      )}

      {/* Riconoscimento a bassa confidenza: «Quale di questi è?» */}
      {candidatesModal && (
        <VisionCandidatesModal
          image={candidatesModal.data.image}
          candidates={candidatesModal.candidates}
          recognizedName={candidatesModal.data.nome || null}
          busy={candBusy}
          language={language}
          onChoose={chooseCandidate}
          onKeep={keepRecognized}
        />
      )}

      {/* Quiz mentre la guida del museo si costruisce: si gioca invece di
          guardare una rotellina, e ogni risposta giusta vale un credito.
          Chiudendolo la generazione continua lo stesso. */}
      {quizAperto && quizUserId && (
        <LoadingQuiz
          destination={quizLuogo}
          userId={quizUserId}
          language={language}
          quizLength={5}
          onDismiss={chiudiQuiz}
        />
      )}

      {/* Visita guidata: dove sei e percorso consigliato */}
      {visitOpen && visit && (
        <MuseumVisitSheet
          key={visit.venueKey}
          visit={visit}
          language={language}
          passExpiresAt={passExpiresAt}
          onClose={() => setVisitOpen(false)}
          onScanNext={() => { setVisitOpen(false); setVisionTarget('artwork'); void openCamera(); }}
        />
      )}

      {/* Foto non riconosciuta: racconto "perché è speciale" (WIP Community) */}
      {commentCard && (
        <VisionCommentModal
          cardId={commentCard.cardId}
          image={commentCard.image}
          refunded={commentCard.refunded}
          language={language}
          onClose={() => setCommentCard(null)}
        />
      )}

      {/* SHOP CREDITI (dal ramo "Crediti Insufficienti") */}
      {shopUserId && (
        <div className="fixed inset-0 z-[10001] bg-white">
          <ShopScreen userId={shopUserId} language={language} onClose={() => setShopUserId(null)} />
        </div>
      )}

      {/* FOTOCAMERA LIVE (getUserMedia): apre l'obiettivo posteriore in modo
          affidabile anche dove il file input con capture viene ignorato. */}
      {showCamera && (
        <div className="fixed inset-0 z-[10002] bg-black flex flex-col">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="flex-1 w-full h-full object-cover"
          />
          <button
            onClick={closeCamera}
            aria-label={tr('vis_close')}
            className="absolute top-6 right-6 w-11 h-11 rounded-full bg-black/50 border border-white/20 flex items-center justify-center text-white active:scale-90 transition-transform"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="absolute bottom-0 left-0 right-0 pb-10 pt-8 flex items-center justify-center bg-gradient-to-t from-black/70 to-transparent">
            <button
              onClick={capturePhoto}
              aria-label={tr('vis_take_photo')}
              className="w-20 h-20 rounded-full bg-white/95 border-4 border-white/40 active:scale-90 transition-transform shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* Hidden file inputs */}
      {/* capture="environment" forces the camera in photo mode */}
      <input 
        type="file" 
        ref={cameraInputRef} 
        className="hidden" 
        accept="image/*" 
        capture="environment"
        onChange={handleFileUpload}
      />
      {/* No capture attribute allows picking from gallery */}
      <input 
        type="file" 
        ref={galleryInputRef} 
        className="hidden" 
        accept="image/*" 
        onChange={handleFileUpload}
      />
    </div>
  );
}
