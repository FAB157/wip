import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, MapPin, Zap, CheckCircle2 } from 'lucide-react';
import { consumeCredits, refundCredits, PRICING_LIST } from '../lib/pricing';
import { saveOfflineMapArea, saveOfflineAudio } from '../lib/offlineStorage';
import { notify } from '../lib/toast';
import { ensurePoiDetails } from '../services/enrichmentService';
import { azureVoiceName } from '../services/ttsService';
import { getApiUrl } from '../lib/api';
import LoadingQuiz from './LoadingQuiz';
import { getTranslation, type Language } from '../lib/i18n';

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
  // Prop `language` a volte minuscola: normalizzata per i dizionari i18n.
  const lang = String(language || 'IT').toUpperCase() as Language;
  const t = (key: string) => getTranslation(key, lang);
  const session = userSession;
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: pois.length, status: '' });
  const [completed, setCompleted] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  // Specchio di `downloading`: durante il download il LoadingQuiz montato
  // dentro gestisce già il proprio focus, quindi la trap qui si sospende.
  const downloadingRef = useRef(false);
  downloadingRef.current = downloading;

  // A11y: focus trap + ritorno del focus alla chiusura, Esc chiude.
  useEffect(() => {
    if (!isOpen) return;
    const root = dialogRef.current;
    if (!root) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const selector = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusables = (): HTMLElement[] =>
      (Array.from(root.querySelectorAll(selector)) as HTMLElement[]).filter(el => el.offsetParent !== null);
    const focusTimer = setTimeout(() => {
      if (!root.contains(document.activeElement) && !downloadingRef.current) focusables()[0]?.focus();
    }, 60);
    const onKeyDown = (e: KeyboardEvent) => {
      if (downloadingRef.current) return; // il LoadingQuiz gestisce la tastiera
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);
  
  // Sconto 50% sul prezzo standard
  const bundlePricePerPoi = Math.floor((PRICING_LIST.audio_guide + PRICING_LIST.poi_detail) * 0.5);
  const cost = pois.length * bundlePricePerPoi;

  const startDownload = async () => {
    // Ospite (28/08/2026): il bundle si paga in crediti, quindi serve un
    // account. Prima il tasto non faceva NIENTE in silenzio: ora si propone
    // il login (stesso evento del tasto "Accedi" di App.tsx).
    if (!session?.user?.id) {
      notify(t('guest_accedi_per'));
      try { window.dispatchEvent(new CustomEvent('wip-open-login')); } catch { /* SSR */ }
      return;
    }
    // Guardia anti doppio tap PRIMA del pagamento: il bottone non era
    // disabilitato e `setDownloading(true)` arrivava dopo l'addebito, quindi
    // due tocchi rapidi scalavano il bundle due volte.
    if (downloading) return;
    setDownloading(true);

    // 1. Pagamento
    const success = await consumeCredits(session.user.id, cost);
    if (!success) {
      setDownloading(false);
      notify(t('vr_b_pb_no_credits'));
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
        setProgress({ current: i, total: pois.length, status: t('vr_b_pb_status_analyze').replace('{name}', poi.name) });

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
          setProgress({ current: i, total: pois.length, status: t('vr_b_pb_status_voice').replace('{name}', poi.name) });
          try {
            // postForAudioBlob: su nativo la fetch patchata da CapacitorHttp
            // corrompeva il corpo binario (MP3 → 0 byte nel bundle offline).
            const { postForAudioBlob } = await import('../lib/audioFetch');
            const { ok, blob } = await postForAudioBlob(getApiUrl('/api/tts/smart'), {
              text: details.summary,
              voice: azureVoiceName('IT', guideMode as any)
            });
            if (ok && blob && blob.size > 500) audioBlobUrl = URL.createObjectURL(blob);
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
          setProgress({ current: i, total: pois.length, status: t('vr_b_pb_status_mp3').replace('{name}', poi.name) });
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
        notify(t('vr_b_pb_none_refund'));
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
        notify(t('vr_b_pb_err_refund'));
      } else {
        notify(t('vr_b_pb_partial'));
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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Bundle offline · ${city}`}
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
              <h3 className="text-sm font-black text-primary mb-2 uppercase tracking-wider text-center">{t('vr_b_pb_downloading')}</h3>
              <p className="text-xs text-gray-500 font-bold text-center mb-4 truncate">{progress.status}</p>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-gradient-to-r from-primary to-indigo-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                  transition={{ ease: "linear" }}
                />
              </div>
              <p className="text-right text-[10px] text-gray-500 font-black mt-2">{progress.current} / {progress.total}</p>
            </div>
          </div>
        ) : completed ? (
          <div className="p-8 text-center">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            </div>
            <h2 className="text-2xl font-black text-gray-900 mb-2">{t('vr_b_pb_ready')}</h2>
            <p className="text-gray-500 font-medium">{t('vr_b_pb_ready_desc').replace('{city}', city)}</p>
          </div>
        ) : (
          <>
            <div className="bg-gradient-to-br from-indigo-600 to-primary p-6 text-white text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-md relative z-10">
                <MapPin className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-black mb-1 relative z-10">{t('vr_b_pb_welcome').replace('{city}', city)}</h2>
              <p className="text-sm text-indigo-100 font-medium relative z-10">{t('vr_b_pb_found').replace('{n}', String(pois.length))}</p>
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-600 mb-6 text-center">
                {t('vr_b_pb_pitch')}
              </p>

              <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200 mb-6 flex items-center justify-between">
                <div>
                  <h4 className="font-black text-amber-900 text-sm">{t('vr_b_pb_discount')}</h4>
                  <p className="text-xs text-amber-700 font-medium">{t('vr_b_pb_instead').replace('{n}', String(pois.length * (PRICING_LIST.audio_guide + PRICING_LIST.poi_detail)))}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-amber-600 flex items-center gap-1">
                    <Zap className="w-5 h-5 fill-current" />
                    {cost}
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-amber-500">{t('vr_b_credits_cap')}</div>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={onClose}
                  className="flex-1 py-4 bg-gray-100 text-gray-500 rounded-xl font-black text-sm hover:bg-gray-200 transition-colors"
                >
                  {t('vr_b_pb_no_thanks')}
                </button>
                <button
                  onClick={startDownload}
                  disabled={downloading}
                  className="flex-[2] py-4 bg-primary text-white rounded-xl font-black text-sm shadow-lg shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:scale-100"
                >
                  <Download className="w-4 h-4" />
                  {t('vr_b_pb_download_n').replace('{n}', String(pois.length))}
                </button>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
