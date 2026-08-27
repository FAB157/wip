import { useState, useRef, useEffect } from 'react';
import { Camera, X, ImageIcon, Loader2, Search, Ticket } from 'lucide-react';
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
import { getLocalMuseumPassExpiry, fetchMuseumPassStatus, buyMuseumPass, formatPassRemaining } from '../lib/museumPass';
import AROverlay from './AROverlay';
import VisionCommentModal from './VisionCommentModal';
import VisionLocationPicker, { VisionCoordsSource, VisionLocationPick } from './VisionLocationPicker';
import VisionCandidatesModal from './VisionCandidatesModal';
import { readJpegExif } from '../lib/exif';
import { db } from '../lib/db';
import { toggleFavoritePoi, getLocalFavorites } from '../lib/favorites';
import { getNearbyPois } from '../services/poiRepository';

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
  const [mode, setMode] = useState<'vision' | 'ar'>('vision');
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

  useEffect(() => {
    fetchMuseumPassStatus().then(setPassExpiresAt);
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

  const handleBuyPass = async () => {
    if (buyingPass) return;
    const { data } = await supabase.auth.getSession();
    const uid = data?.session?.user?.id;
    if (!uid) { setError(tr('vis_pass_login')); return; }
    const bal = await getWalletBalance(uid);
    setCurrentBalance(bal.total);
    const confirmed = await creditConfirm.requestConfirmation(PRICING_LIST.museum_pass, getTranslation("museum_pass_title", language));
    if (!confirmed) return;
    setBuyingPass(true);
    const out = await buyMuseumPass();
    setBuyingPass(false);
    if (out.ok && out.expiresAt) {
      setPassExpiresAt(out.expiresAt);
      notify(getTranslation("museum_pass_bought", language));
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

  return (
    <div className="flex-1 w-full h-full relative bg-[#0a0a0a] overflow-hidden flex flex-col font-sans">
      {quotaToast && <QuotaLimitToast feature={quotaToast} onClose={closeQuotaToast} />}

      {/* Prima card guidata: overlay una-tantum al primo ingresso in camera */}
      <AnimatePresence>
        {showFirstGuide && mode === 'vision' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <div className="w-full max-w-sm bg-[#111827] border border-white/15 rounded-3xl p-6 space-y-4 text-white shadow-2xl">
              <h3 className="text-lg font-black text-center">{tr('vis_first_title')}</h3>
              <div className="space-y-3">
                {(['vis_first_step1', 'vis_first_step2', 'vis_first_step3'] as const).map((key, i) => (
                  <div key={key} className="flex items-start gap-3">
                    <span className="w-7 h-7 shrink-0 rounded-full bg-primary flex items-center justify-center text-xs font-black">{i + 1}</span>
                    <p className="text-sm text-white/85">{tr(key)}</p>
                  </div>
                ))}
              </div>
              {nearbySuggestion && (
                <div className="bg-primary/20 border border-primary/40 rounded-2xl px-4 py-3 text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-0.5">{tr('vis_first_nearby')}</p>
                  <p className="text-sm font-black">{nearbySuggestion.name} <span className="font-bold text-white/60">~{nearbySuggestion.dist} m</span></p>
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
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 z-40 w-10 h-10 rounded-full bg-surface/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-secondary active:scale-90 transition-transform shadow-lg cursor-pointer hover:bg-surface/20"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      {/* Decorative Background */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-[100px]" />
      </div>

      <div className="flex-1 relative flex flex-col items-center justify-center p-8 z-10">
        {mode === 'vision' ? (
          <>
            <div className="w-full flex bg-surface/10 rounded-2xl p-1 backdrop-blur-md border border-white/10 mb-8 max-w-xs">
              <button 
                onClick={() => setMode('vision')}
                className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${mode === 'vision' ? 'bg-primary text-white shadow-lg' : 'text-secondary/60 hover:text-secondary'}`}
              >
                {tr('vis_tab_scan')}
              </button>
              <button
                onClick={() => setMode('ar')}
                className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${mode === 'ar' ? 'bg-primary text-white shadow-lg' : 'text-secondary/60 hover:text-secondary'}`}
              >
                {tr('vis_tab_ar')}
              </button>
            </div>

            <div className="w-24 h-24 bg-surface/5 rounded-[2.5rem] flex items-center justify-center mb-8 border border-white/10 backdrop-blur-xl shadow-2xl">
              <Search className="w-12 h-12 text-primary" />
            </div>
        
        <h2 className="text-3xl font-black text-secondary text-center mb-4 tracking-tight">
          {tr('vis_title')}
        </h2>
        <p className="text-xs text-secondary/40 font-medium max-w-[200px] text-center mx-auto">
          {visionTarget === 'artwork'
            ? tr('vis_hint_artwork')
            : visionTarget === 'nature'
            ? tr('vis_hint_nature')
            : tr('vis_hint_place')}
        </p>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          {/* Coda Vision offline: foto scattate senza rete, in attesa */}
          {queueCount > 0 && (
            <div className="w-full px-4 py-3 rounded-2xl border border-sky-400/30 bg-sky-400/10 backdrop-blur-md text-left">
              <p className="text-xs font-black text-sky-300">
                {(queueProcessing ? tr('vis_queue_processing') : tr('vis_queue_waiting')).replace('{n}', String(queueCount))}
              </p>
            </div>
          )}
          {/* Selettore modalità: Luogo / Opera (ondata 7) / Natura.
              La modalità "Screenshot" (da reel a itinerario) e' stata tolta
              dall'interfaccia il 22/08/2026 per decisione del committente: il
              ramo analyzeScreenshot e la rotta server restano, ma senza
              questo pulsante non si raggiungono. */}
          <div className="w-full flex items-center gap-1 p-1 bg-surface/10 border border-white/10 rounded-2xl backdrop-blur-md">
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
                  visionTarget === opt.key ? 'bg-primary text-white shadow-lg' : 'text-secondary/50 hover:text-secondary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={openCamera}
            disabled={isScanning}
            className="w-full flex items-center justify-center gap-3 py-4 bg-primary text-white font-black text-base rounded-2xl shadow-[0_0_40px_rgba(var(--color-primary),0.3)] active:scale-95 transition-all hover:bg-primary/90 disabled:opacity-50 disabled:active:scale-100"
          >
            <Camera className="w-5 h-5" />
            <span>{tr('vis_take_photo')}</span>
          </button>

          <button
            onClick={() => galleryInputRef.current?.click()}
            disabled={isScanning}
            className="w-full flex items-center justify-center gap-3 py-4 bg-surface/10 text-secondary font-black text-base rounded-2xl border border-white/10 backdrop-blur-md active:scale-95 transition-all hover:bg-surface/20 disabled:opacity-50 disabled:active:scale-100"
          >
            <ImageIcon className="w-5 h-5" />
            <span>{tr('vis_pick_gallery')}</span>
          </button>

          {/* PASS MUSEO — dentro un museo il geofencing tace per design:
              l'esperienza indoor è inquadrare le opere, col pass è illimitata */}
          {passActive && passExpiresAt !== null ? (
            <div className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 backdrop-blur-md">
              <div className="w-9 h-9 rounded-xl bg-amber-400/20 flex items-center justify-center shrink-0">
                <Ticket className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-black text-amber-300">{getTranslation("museum_pass_active", language)}</p>
                <p className="text-[10px] font-bold text-amber-200/70">
                  {getTranslation("museum_pass_unlimited", language)} · {getTranslation("museum_pass_remaining", language)} {formatPassRemaining(passExpiresAt)}
                </p>
              </div>
            </div>
          ) : (
            <button
              onClick={handleBuyPass}
              disabled={isScanning || buyingPass}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-amber-400/30 bg-surface/5 backdrop-blur-md active:scale-95 transition-all hover:bg-amber-400/10 disabled:opacity-50 disabled:active:scale-100"
            >
              <div className="w-9 h-9 rounded-xl bg-amber-400/15 flex items-center justify-center shrink-0">
                {buyingPass ? <Loader2 className="w-5 h-5 text-amber-400 animate-spin" /> : <Ticket className="w-5 h-5 text-amber-400" />}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-black text-secondary">
                  {getTranslation("museum_pass_title", language)} · {PRICING_LIST.museum_pass} {getTranslation("credits_word", language)}
                </p>
                <p className="text-[10px] font-bold text-secondary/50 leading-snug">{getTranslation("museum_pass_desc", language)}</p>
              </div>
            </button>
          )}
        </div>
        </>
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
