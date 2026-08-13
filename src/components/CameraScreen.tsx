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

interface CameraScreenProps {
  onRecognize: (data: any) => void;
  onClose?: () => void;
  language: Language;
}

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
  const [visionTarget, setVisionTarget] = useState<'place' | 'artwork'>('place');
  const { quotaToast, showQuotaToast, closeQuotaToast } = useQuotaToast();
  
  const creditConfirm = useCreditConfirmation();
  const [currentBalance, setCurrentBalance] = useState(0);
  const [shopUserId, setShopUserId] = useState<string | null>(null);
  // Foto NON riconosciuta: crediti già rimborsati dal server, la scheda resta
  // in My Vision → chiediamo all'utente di raccontare perché è speciale.
  const [commentCard, setCommentCard] = useState<{ cardId: string | null; image: string; refunded: boolean } | null>(null);
  // Pass Museo: mirror locale subito (musei = rete scarsa), poi verità server.
  const [passExpiresAt, setPassExpiresAt] = useState<number | null>(getLocalMuseumPassExpiry());
  const [buyingPass, setBuyingPass] = useState(false);
  // Foto in analisi: sfondo del mirino di scansione stile AR.
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const passActive = passExpiresAt !== null && passExpiresAt > Date.now();

  useEffect(() => {
    fetchMuseumPassStatus().then(setPassExpiresAt);
    // Tick per countdown e scadenza del banner senza rifetch.
    const t = setInterval(() => setTick(x => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

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
    if (!uid) { setError("Accedi con il tuo account per attivare il Pass Museo."); return; }
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
      notify("Crediti insufficienti. Visita lo store per ricaricare.");
      openCreditShop();
    } else if (out.error === 'login') {
      setError("Accedi con il tuo account per attivare il Pass Museo.");
    } else {
      notify(getTranslation("museum_pass_error", language));
    }
  };

const resizeImage = (file: File, maxWidth = 800, maxHeight = 800): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas non supportato"));
      
      ctx.drawImage(img, 0, 0, width, height);
      
      const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
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
    let w = video.videoWidth, h = video.videoHeight;
    const maxW = 800, maxH = 800;
    if (w > maxW || h > maxH) {
      if (w > h) { h = Math.round((h * maxW) / w); w = maxW; }
      else { w = Math.round((w * maxH) / h); h = maxH; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
    closeCamera();
    setPreviewImage(`data:image/jpeg;base64,${base64}`);
    await analyzeImage(base64);
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

    try {
      setIsScanning(true);
      const base64Image = await resizeImage(file, 800, 800);
      setPreviewImage(`data:image/jpeg;base64,${base64Image}`);
      await analyzeImage(base64Image);
    } catch (e) {
      console.error("Resize error:", e);
      setIsScanning(false);
      setError("Errore durante l'elaborazione dell'immagine. Riprova.");
    } finally {
      // Reset del valore: senza, riselezionare la STESSA foto non fa scattare
      // onChange (il valore dell'input non cambia) e la scansione non parte.
      input.value = '';
    }
  };

  const analyzeImage = async (base64Image: string) => {
    setIsScanning(true);
    setError('');
    
    // Prova a recuperare le coordinate GPS
    let gpsLat: number | null = null;
    let gpsLon: number | null = null;
    
    try {
      const lastLoc = locationService.getLastLocation();
      if (lastLoc && lastLoc.latitude && lastLoc.longitude) {
        gpsLat = lastLoc.latitude;
        gpsLon = lastLoc.longitude;
        console.log("[Camera] Using coordinates from robust central locationService:", gpsLat, gpsLon);
      } else {
        const pos: any = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
        });
        gpsLat = pos.coords.latitude;
        gpsLon = pos.coords.longitude;
        console.log("[Camera] Falling back to direct geolocation coords:", gpsLat, gpsLon);
      }
    } catch (e) {
      console.debug("Could not get GPS coordinates for Camera Vision cache:", e);
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
        visionTarget === 'artwork' ? "Visione AI — Opera d'arte" : "Visione AI"
      );
      if (!confirmed) return;
      setIsScanning(true);
    }

    // Telemetry log API use
    logApiCall('gemini_vision', 'scansione_fotocamera');

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
          imageBase64: base64Image,
          lat: gpsLat,
          lon: gpsLon,
          // Modalità "Opera" (ondata 7): il server identifica l'opera
          // inquadrata (quadro/statua/reperto), non l'edificio del GPS.
          ...(visionTarget === 'artwork' ? { mode: 'artwork' } : {})
        })
      });

      if (res.status === 401) {
        setError("Accedi con il tuo account per usare la Visione AI.");
        return;
      }
      if (res.status === 402) {
        notify("Crediti insufficienti. Visita lo store per ricaricare.");
        openCreditShop();
        return;
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || "Errore durante l'analisi");
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
        onRecognize(enrichedData);
      } else {
        // Il server ha già (best-effort) rimborsato i crediti e salvato la
        // foto in My Vision: chiediamo all'utente perché quel posto è speciale
        // (il racconto aiuta la revisione WIP Community). `refunded` riflette
        // l'esito reale del rimborso server, non un messaggio fisso.
        setCommentCard({ cardId: data.card_id || null, image: `data:image/jpeg;base64,${base64Image}`, refunded: !!data.refunded });
      }
    } catch (err: any) {
      console.error(err);
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
              <h3 className="text-lg font-black text-center">📸 La tua prima scoperta</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 shrink-0 rounded-full bg-primary flex items-center justify-center text-xs font-black">1</span>
                  <p className="text-sm text-white/85"><b>Inquadra un monumento</b>, una chiesa o uno scorcio che ti colpisce: il mirino AI lo riconosce da solo.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 shrink-0 rounded-full bg-primary flex items-center justify-center text-xs font-black">2</span>
                  <p className="text-sm text-white/85"><b>Scatta</b>: ottieni subito la scheda del luogo con l'audioguida da ascoltare.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 shrink-0 rounded-full bg-primary flex items-center justify-center text-xs font-black">3</span>
                  <p className="text-sm text-white/85"><b>Guadagna crediti</b>: se la tua foto viene pubblicata nella WIP Community ricevi <b>+10 crediti</b> da spendere nell'app.</p>
                </div>
              </div>
              {nearbySuggestion && (
                <div className="bg-primary/20 border border-primary/40 rounded-2xl px-4 py-3 text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-0.5">Vicino a te, da provare subito</p>
                  <p className="text-sm font-black">{nearbySuggestion.name} <span className="font-bold text-white/60">a ~{nearbySuggestion.dist} m</span></p>
                </div>
              )}
              <button
                onClick={dismissFirstGuide}
                className="w-full py-3 bg-primary rounded-2xl font-black text-sm uppercase tracking-widest active:scale-95 transition-transform"
              >
                Iniziamo!
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
                Scansione AI
              </button>
              <button 
                onClick={() => setMode('ar')}
                className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${mode === 'ar' ? 'bg-primary text-white shadow-lg' : 'text-secondary/60 hover:text-secondary'}`}
              >
                Radar AR
              </button>
            </div>

            <div className="w-24 h-24 bg-surface/5 rounded-[2.5rem] flex items-center justify-center mb-8 border border-white/10 backdrop-blur-xl shadow-2xl">
              <Search className="w-12 h-12 text-primary" />
            </div>
        
        <h2 className="text-3xl font-black text-secondary text-center mb-4 tracking-tight">
          Analizza il Mondo
        </h2>
        <p className="text-xs text-secondary/40 font-medium max-w-[200px] text-center mx-auto">
          {visionTarget === 'artwork'
            ? "Inquadra un quadro, una statua o un reperto: WIP riconosce l'opera e te la racconta come un'audioguida."
            : 'Scansiona per riconoscere il punto di interesse: la scheda finisce in My Vision e sblocchi 10 XP.'}
        </p>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          {/* Vision opere musei (ondata 7): selettore Luogo/Opera */}
          <div className="w-full flex items-center gap-1 p-1 bg-surface/10 border border-white/10 rounded-2xl backdrop-blur-md">
            {([
              { key: 'place', label: '📍 Luogo' },
              { key: 'artwork', label: '🖼️ Opera' },
            ] as const).map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setVisionTarget(opt.key)}
                aria-pressed={visionTarget === opt.key}
                className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all active:scale-95 ${
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
            <span>Scatta Foto</span>
          </button>

          <button
            onClick={() => galleryInputRef.current?.click()}
            disabled={isScanning}
            className="w-full flex items-center justify-center gap-3 py-4 bg-surface/10 text-secondary font-black text-base rounded-2xl border border-white/10 backdrop-blur-md active:scale-95 transition-all hover:bg-surface/20 disabled:opacity-50 disabled:active:scale-100"
          >
            <ImageIcon className="w-5 h-5" />
            <span>Scegli dalla Galleria</span>
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
              onRecognize({ ...poi, riconosciuto: true, spiegazione_audio: poi.summary || poi.description_long || "Esplora questo punto di interesse in AR!" });
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
            aria-label="Chiudi fotocamera"
            className="absolute top-6 right-6 w-11 h-11 rounded-full bg-black/50 border border-white/20 flex items-center justify-center text-white active:scale-90 transition-transform"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="absolute bottom-0 left-0 right-0 pb-10 pt-8 flex items-center justify-center bg-gradient-to-t from-black/70 to-transparent">
            <button
              onClick={capturePhoto}
              aria-label="Scatta foto"
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
