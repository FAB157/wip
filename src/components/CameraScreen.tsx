import { useState, useRef } from 'react';
import { Camera, X, ImageIcon, Loader2, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { Language, getTranslation } from '../lib/i18n';
import { notify } from '../lib/toast';
import { checkUserQuota, incrementUserQuota } from '../lib/quotaManager';
import QuotaLimitToast, { useQuotaToast } from './QuotaLimitToast';
import { useCreditConfirmation } from '../hooks/useCreditConfirmation';
import CreditConfirmationModal from './CreditConfirmationModal';
import { consumeCredits, refundCredits, PRICING_LIST, getWalletBalance } from '../lib/pricing';
import ShopScreen from './ShopScreen';
import { logApiCall } from '../lib/apiLogger';
import { getApiUrl } from '../lib/api';
import { locationService } from '../services/locationService';
import AROverlay from './AROverlay';

interface CameraScreenProps {
  onRecognize: (data: any) => void;
  onClose?: () => void;
  language: Language;
}

export default function CameraScreen({ onRecognize, onClose, language }: CameraScreenProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string>('');
  const [mode, setMode] = useState<'vision' | 'ar'>('vision');
  const { quotaToast, showQuotaToast, closeQuotaToast } = useQuotaToast();
  
  const creditConfirm = useCreditConfirmation();
  const [currentBalance, setCurrentBalance] = useState(0);
  const [shopUserId, setShopUserId] = useState<string | null>(null);

  const openCreditShop = async () => {
    const { data } = await supabase.auth.getSession();
    setShopUserId(data?.session?.user?.id || "mock-user-id");
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

  const handleFileUpload = async (event: import('react').ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    try {
      setIsScanning(true);
      const base64Image = await resizeImage(file, 800, 800);
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

    // Se abbiamo le coordinate GPS, controlla prima il database di cache globale condivisa
    if (gpsLat !== null && gpsLon !== null) {
      try {
        const latMargin = 0.0003;
        const lonMargin = 0.0003;
        const { data: list, error: err } = await supabase
          .from("shared_vision_cache")
          .select("*")
          .gte("lat", gpsLat - latMargin)
          .lte("lat", gpsLat + latMargin)
          .gte("lon", gpsLon - lonMargin)
          .lte("lon", gpsLon + lonMargin);

        if (list && list.length > 0 && !err) {
          const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
            const R = 6371e3;
            const phi1 = (lat1 * Math.PI) / 180;
            const phi2 = (lat2 * Math.PI) / 180;
            const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
            const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
            const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          };

          let closestItem: any = null;
          let minDistance = 30; // Massimo 30 metri di tolleranza

          for (const item of list) {
            const dist = calculateDistance(gpsLat, gpsLon, item.lat, item.lon);
            if (dist < minDistance) {
              minDistance = dist;
              closestItem = item;
            }
          }

          if (closestItem) {
            console.log("[Global Vision Cache] Hit: Landmark recognized via GPS within", Math.round(minDistance), "meters!");
            onRecognize(closestItem.data);
            setIsScanning(false);
            return; // Successo immediato a costo zero!
          }
        }
      } catch (e) {
        console.debug("Supabase vision cache query skipped/failed:", e);
      }
    }

    // Check photo_search quota before executing AI recognition
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id || "mock-user-id";
    
    setIsScanning(false); // Pausa per mostrare il modale
    const bal = await getWalletBalance(currentUserId);
    setCurrentBalance(bal.total);
    const confirmed = await creditConfirm.requestConfirmation(PRICING_LIST.photo_search, "Visione AI");
    if (!confirmed) return;
    setIsScanning(true);
    
    const payRes = await consumeCredits(currentUserId, PRICING_LIST.photo_search);
    if (!payRes) {
      notify("Crediti insufficienti. Visita lo store per ricaricare.");
      setIsScanning(false);
      return;
    }

    // Telemetry log API use
    logApiCall('gemini_vision', 'scansione_fotocamera');

    try {
      // getApiUrl: su app nativa il path relativo puntava agli asset locali
      // e la scansione falliva SEMPRE su telefono.
      // Bearer della sessione: fa risolvere lo userId reale lato server (quota
      // e vision_cards corrette) invece del fallback anonimo per IP.
      const visionHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      const accessToken = sessionData?.session?.access_token;
      if (accessToken) visionHeaders['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(getApiUrl('/api/vision'), {
        method: 'POST',
        headers: visionHeaders,
        body: JSON.stringify({
          imageBase64: base64Image,
          lat: gpsLat,
          lon: gpsLon
        })
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || "Errore durante l'analisi");
      }
      
      const data = await res.json();
      
      if (data.riconosciuto) {
        const { data: sessionData } = await supabase.auth.getSession();
        const currentUserId = sessionData?.session?.user?.id || "mock-user-id";
        await incrementUserQuota(currentUserId, "photo_search");
        const enrichedData = { ...data, image: `data:image/jpeg;base64,${base64Image}` };
        onRecognize(enrichedData);
        
        // Salva in background l'analisi geolocalizzata su Supabase per condividerla
        if (gpsLat !== null && gpsLon !== null) {
          try {
            const cacheId = `vision_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            await supabase.from("shared_vision_cache").insert({
              id: cacheId,
              lat: gpsLat,
              lon: gpsLon,
              data: data,
              created_at: new Date().toISOString()
            });
            console.log("[Global Vision Cache] Successfully saved analysis details for GPS coords:", gpsLat, gpsLon);
          } catch(e) {}
        }
      } else {
        // Nessun riconoscimento = nessun servizio erogato: crediti indietro
        await refundCredits(currentUserId, PRICING_LIST.photo_search);
        setError(getTranslation("camera_error_not_recognized", language));
      }
    } catch (err: any) {
      console.error(err);
      await refundCredits(currentUserId, PRICING_LIST.photo_search)
        .catch(e => console.error('[Vision] Rimborso fallito:', e));
      // Match case-insensitive: il server risponde "Quota Exceeded" (maiuscolo).
      const errMsg = (err.message || '').toLowerCase();
      if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('rate limit')) {
        setError(getTranslation("camera_error_quota", language));
      } else {
        setError(err.message || getTranslation("camera_error_failed", language));
      }
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="flex-1 w-full h-full relative bg-[#0a0a0a] overflow-hidden flex flex-col font-sans">
      {quotaToast && <QuotaLimitToast feature={quotaToast} onClose={closeQuotaToast} />}
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
          Scansiona per riconoscere il punto di interesse e sbloccare 5 XP.
        </p>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button 
            onClick={() => cameraInputRef.current?.click()}
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
              <div className="w-full max-w-xs bg-[#151619] border border-white/10 rounded-[2.5rem] p-8 text-center shadow-2xl">
                 {isScanning ? (
                   <>
                     <div className="w-20 h-20 mx-auto mb-6 relative">
                       <div className="absolute inset-0 border-2 border-primary/20 rounded-full animate-ping"></div>
                       <div className="w-full h-full bg-primary/10 rounded-full flex items-center justify-center">
                         <Loader2 className="w-10 h-10 text-primary animate-spin" />
                       </div>
                     </div>
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

      {/* SHOP CREDITI (dal ramo "Crediti Insufficienti") */}
      {shopUserId && (
        <div className="fixed inset-0 z-[10001] bg-white">
          <ShopScreen userId={shopUserId} language={language} onClose={() => setShopUserId(null)} />
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
