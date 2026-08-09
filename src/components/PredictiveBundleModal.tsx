import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, MapPin, Zap, CheckCircle2 } from 'lucide-react';
import { consumeCredits, refundCredits, PRICING_LIST } from '../lib/pricing';
import { saveOfflineMapArea, saveOfflineAudio } from '../lib/offlineStorage';
import { notify } from '../lib/toast';
import { ensurePoiDetails } from '../services/enrichmentService';
import { azureVoiceName } from '../services/ttsService';
import { getApiUrl } from '../lib/api';
import LoadingQuiz from './LoadingQuiz';
import { getTranslation } from '../lib/i18n';

interface PredictiveBundleModalProps {
  isOpen: boolean;
  city: string;
  lat: number;
  lon: number;
  pois: any[];
  onClose: () => void;
  language: string;
  guideMode: 'nicky' | 'dante';
  userSession: any;
}

export default function PredictiveBundleModal({
  isOpen, city, lat, lon, pois, onClose, language, guideMode, userSession
}: PredictiveBundleModalProps) {
  const session = userSession;
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: pois.length, status: '' });
  const [completed, setCompleted] = useState(false);
  
  // Sconto 50% sul prezzo standard
  const bundlePricePerPoi = Math.floor((PRICING_LIST.audio_guide + PRICING_LIST.poi_detail) * 0.5);
  const cost = pois.length * bundlePricePerPoi;

  const startDownload = async () => {
    if (!session?.user?.id) return;
    // Guardia anti doppio tap PRIMA del pagamento: il bottone non era
    // disabilitato e `setDownloading(true)` arrivava dopo l'addebito, quindi
    // due tocchi rapidi scalavano il bundle due volte.
    if (downloading) return;
    setDownloading(true);

    // 1. Pagamento
    const success = await consumeCredits(session.user.id, cost);
    if (!success) {
      setDownloading(false);
      notify("Crediti insufficienti. Ricarica il tuo portafoglio.");
      return;
    }

    let downloadedCount = 0;
    try {
      // 2. Registra l'area offline
      const areaId = `bundle_${city.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`;
      await saveOfflineMapArea({
        id: areaId,
        name: `Bundle: ${city}`,
        center: { lat, lon },
        radiusKm: 20,
        date: Date.now(),
        poiCount: pois.length
      }, pois);

      // 3. Processa e scarica ogni POI
      for (let i = 0; i < pois.length; i++) {
        const poi = pois[i];
        setProgress({ current: i, total: pois.length, status: `Analizzo ${poi.name}...` });

        // A. Assicurati che sia arricchito (testo presente)
        const details = await ensurePoiDetails({
          id: poi.id,
          name: poi.name,
          lat,
          lon,
          category: poi.category
        }, 'it');

        let audioUrl = poi.audio_url_short;

        // B. Genera l'audio se non esiste.
        // `/api/poi/generate-audio` NON è mai esistita: ogni bundle finiva
        // senza un solo MP3 pur avendo addebitato i crediti. Si usa la
        // stessa route del resto dell'app (`/api/tts/smart`), che risponde
        // direttamente con il file audio.
        let audioBlobUrl: string | null = null;
        if (!audioUrl && details?.summary) {
          setProgress({ current: i, total: pois.length, status: `Generazione voce Premium per ${poi.name}...` });
          try {
            const res = await fetch(getApiUrl('/api/tts/smart'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: details.summary,
                voice: azureVoiceName('IT', guideMode as any)
              })
            });
            if (res.ok) {
              const blob = await res.blob();
              if (blob.size > 500) audioBlobUrl = URL.createObjectURL(blob);
            }
          } catch (e) {
            console.warn(`Fallita generazione audio per ${poi.name}`);
          }
        }

        // C. Scarica fisicamente l'MP3 nel telefono (IndexedDB).
        // Chiave `<poiId>_<guideMode>`: è quella che i lettori usano davvero
        // (GeofenceAudioGuide/PoiDetailSheet); con la sola `poi.id` il file
        // salvato non veniva mai ritrovato.
        const source = audioBlobUrl || audioUrl;
        if (source) {
          setProgress({ current: i, total: pois.length, status: `Download MP3 di ${poi.name}...` });
          try {
            await saveOfflineAudio(source, `${poi.id}_${guideMode}`);
            downloadedCount++;
          } finally {
            if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
          }
        }
      }

      if (downloadedCount === 0) {
        // Nessun audio scaricato = servizio non erogato: crediti indietro
        await refundCredits(session.user.id, cost).catch(e => console.error('[Bundle] Rimborso fallito:', e));
        notify("Non è stato possibile scaricare le audioguide. I crediti ti sono stati restituiti.");
        return;
      }

      setCompleted(true);
      setTimeout(() => {
        onClose();
      }, 3000);

    } catch (e) {
      console.error("Errore download bundle:", e);
      if (downloadedCount === 0) {
        await refundCredits(session.user.id, cost).catch(err => console.error('[Bundle] Rimborso fallito:', err));
        notify("Si è verificato un errore durante il download. I crediti ti sono stati restituiti.");
      } else {
        notify("Download interrotto: alcune audioguide potrebbero mancare.");
      }
    } finally {
      setDownloading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
      />
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
      >
        {downloading ? (
          <div className="p-0 flex-1 flex flex-col h-[500px]">
            {/* Wrapper del Quiz per vincere crediti durante l'attesa */}
            <div className="flex-1 relative overflow-hidden bg-indigo-50">
               <LoadingQuiz destination={city} userId={session?.user?.id || 'guest'} />
            </div>
            {/* Progress Bar in basso */}
            <div className="bg-white p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-10">
              <h3 className="text-sm font-black text-primary mb-2 uppercase tracking-wider text-center">Download in corso</h3>
              <p className="text-xs text-gray-500 font-bold text-center mb-4 truncate">{progress.status}</p>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-gradient-to-r from-primary to-indigo-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                  transition={{ ease: "linear" }}
                />
              </div>
              <p className="text-right text-[10px] text-gray-400 font-black mt-2">{progress.current} / {progress.total}</p>
            </div>
          </div>
        ) : completed ? (
          <div className="p-8 text-center">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            </div>
            <h2 className="text-2xl font-black text-gray-900 mb-2">Bundle Pronto!</h2>
            <p className="text-gray-500 font-medium">Ora puoi esplorare {city} anche senza connessione internet. Le voci Premium sono state salvate nel tuo telefono.</p>
          </div>
        ) : (
          <>
            <div className="bg-gradient-to-br from-indigo-600 to-primary p-6 text-white text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-md relative z-10">
                <MapPin className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-black mb-1 relative z-10">Benvenuto a {city}!</h2>
              <p className="text-sm text-indigo-100 font-medium relative z-10">Abbiamo trovato {pois.length} Gemme Culturali intorno a te.</p>
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-600 mb-6 text-center">
                Spesso i siti storici hanno poca ricezione. Scarica subito il pacchetto offline completo (Testi + Voci Neurali Premium) per non perderti nulla.
              </p>

              <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200 mb-6 flex items-center justify-between">
                <div>
                  <h4 className="font-black text-amber-900 text-sm">Sconto Bundle Regionale (50%)</h4>
                  <p className="text-xs text-amber-700 font-medium">Invece di {pois.length * (PRICING_LIST.audio_guide + PRICING_LIST.poi_detail)} crediti singolarmente.</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-amber-600 flex items-center gap-1">
                    <Zap className="w-5 h-5 fill-current" />
                    {cost}
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-amber-500">Crediti</div>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={onClose}
                  className="flex-1 py-4 bg-gray-100 text-gray-500 rounded-xl font-black text-sm hover:bg-gray-200 transition-colors"
                >
                  No, grazie
                </button>
                <button
                  onClick={startDownload}
                  disabled={downloading}
                  className="flex-[2] py-4 bg-primary text-white rounded-xl font-black text-sm shadow-lg shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:scale-100"
                >
                  <Download className="w-4 h-4" />
                  Scarica {pois.length} Audioguide
                </button>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
