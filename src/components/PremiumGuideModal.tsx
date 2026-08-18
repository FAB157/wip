import React, { useState, useCallback, useRef } from 'react';
import LoadingQuiz from './LoadingQuiz';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, RefreshCw, AlertTriangle, Star, Loader2 } from 'lucide-react';
import { notify } from '../lib/toast';
import {
  GuideStyle,
  PremiumGuideContent,
  generatePremiumGuide,
  downloadGuideAsPdf,
  downloadGuideAsEpub,
  uploadPdfToStorage,
  GUIDE_STYLE_META,
  getAccessToken,
} from '../services/premiumGuideService';
import { getUserProfile, isUserPremium } from '../lib/quotaManager';
import { useCreditConfirmation } from '../hooks/useCreditConfirmation';
import CreditConfirmationModal from './CreditConfirmationModal';
import { PRICING_LIST, getWalletBalance, notifyCreditsChanged } from '../lib/pricing';
import { Language, getTranslation } from '../lib/i18n';
import { getApiUrl } from '../lib/api';
import ShopScreen from './ShopScreen';
import PremiumGuideRenderer from './PremiumGuideRenderer';

interface PremiumGuideModalProps {
  itinerary: any;
  userId: string;
  language: Language;
  onClose: () => void;
}

type Phase = 'select_style' | 'generating' | 'preview' | 'error';

const STYLES: GuideStyle[] = ['art', 'family', 'shopping', 'food', 'essential'];

const GENERATION_STEPS = [
  'Analisi fonti certificate...',
  'Ricerca e validazione locali...',
  'Elaborazione creativa della Guida...',
  'Verifica dei contenuti storici...',
  'Recupero immagini ufficiali...',
  'Impaginazione PDF editoriale in corso...'
];

// ─────────────────────────────────────────────────────────────────────────────
export default function PremiumGuideModal({
  itinerary,
  userId,
  language,
  onClose,
}: PremiumGuideModalProps) {
  const [phase, setPhase]                   = useState<Phase>('select_style');
  const [selectedStyle, setSelectedStyle]   = useState<GuideStyle>('essential');
  const [guideContent, setGuideContent]     = useState<PremiumGuideContent | null>(null);
  const [mediaManifest, setMediaManifest]   = useState<Record<string, string>>({});
  const [guideHash, setGuideHash]           = useState<string>('');
  const [errorMsg, setErrorMsg]             = useState<string>('');
  const [streamingText, setStreamingText]   = useState<string>('');
  const [isDownloading, setIsDownloading]   = useState(false);
  const [isEpubLoading, setIsEpubLoading]   = useState(false);
  // Dedica regalo (opzionale): finisce in copertina, costo invariato
  const [dedica, setDedica]                 = useState('');
  const [stepIndex, setStepIndex]           = useState(0);
  const [isPremiumUser, setIsPremiumUser]   = useState<boolean | null>(null);
  const [creditsLeft, setCreditsLeft]       = useState<number | null>(null);
  const stepIntervalRef                     = useRef<ReturnType<typeof setInterval> | null>(null);
  const PDF_CONTAINER_ID = 'premium-guide-pdf-container';
  
  const creditConfirm = useCreditConfirmation();
  const [currentBalance, setCurrentBalance] = useState(0);
  const [showShop, setShowShop] = useState(false);

  // ── Check premium status on mount ──────────────────────────────────────────
  React.useEffect(() => {
    (async () => {
      const profile = await getUserProfile(userId);
      const premium = isUserPremium(profile);
      setIsPremiumUser(premium);
    })();
  }, [userId]);

  // ── Animated step cycling during generation ────────────────────────────────
  const startStepCycle = useCallback(() => {
    setStepIndex(0);
    stepIntervalRef.current = setInterval(() => {
      setStepIndex(prev => (prev + 1) % GENERATION_STEPS.length);
    }, 2800);
  }, []);

  const stopStepCycle = useCallback(() => {
    if (stepIntervalRef.current) {
      clearInterval(stepIntervalRef.current);
      stepIntervalRef.current = null;
    }
  }, []);

  // ── Main generation handler ────────────────────────────────────────────────
  const handleGenerate = async () => {
    // Prima chiedi conferma
    const bal = await getWalletBalance(userId);
    setCurrentBalance(bal.total);
    const numDaysPremium = itinerary?.giorni?.length || 1;
    const premiumCost = PRICING_LIST.premium_guide_daily * numDaysPremium;
    
    const confirmed = await creditConfirm.requestConfirmation(premiumCost, `Guida Premium PDF (${numDaysPremium} giorni)`);
    if (!confirmed) return;
    
    setPhase('generating');
    startStepCycle();

    try {
      setStreamingText('');
      // ADDEBITO E RIMBORSO ORA SERVER-SIDE: la rotta /premium-guide/generate
      // scala i crediti in modo atomico e li restituisce se la generazione
      // fallisce. Il client non addebita più (niente doppio addebito), passa
      // solo il token; la modale di conferma sopra resta come UX.
      const result = await generatePremiumGuide(itinerary, selectedStyle, userId, language, dedica);

      // Validazione d'esito: una guida senza giorni è un fallimento mascherato.
      // In quel caso il server ha già rimborsato (throw → catch server).
      const giorni = (result.content as any)?.giorni;
      if (!Array.isArray(giorni) || giorni.length === 0) {
        throw new Error('GUIDE_INCOMPLETE');
      }

      stopStepCycle();
      setGuideContent(result.content);
      setMediaManifest(result.media_manifest);
      setGuideHash(result.hash);
      setPhase('preview');
      // Il saldo è cambiato lato server: aggiorna le viste che mostrano i crediti.
      notifyCreditsChanged({ userId });
    } catch (err: any) {
      stopStepCycle();
      const msg = err?.message || '';
      if (msg === 'INSUFFICIENT_CREDITS') {
        setErrorMsg(getTranslation('err_insufficient_credits', language));
      } else if (msg === 'QUOTA_EXCEEDED') {
        setErrorMsg(getTranslation('premium_guide_quota_exceeded', language));
      } else {
        setErrorMsg(getTranslation('premium_guide_error', language));
      }
      setPhase('error');
      // Se il server aveva addebitato e poi fallito, ha già rimborsato:
      // riallinea comunque il saldo mostrato.
      notifyCreditsChanged({ userId });
    }
  };

  // ── PDF download handler ───────────────────────────────────────────────────
  
  const [playingPodcast, setPlayingPodcast] = useState(false);

  const handleShareGuide = async () => {
    if (!guideContent) return;
    const shareText = `Guarda la mia fantastica Guida Premium per ${guideContent.guida_titolo} creata con Italia in Tasca! 🌍📖`;
    const shareUrl = window.location.href; // O il link generato del PDF se salvato
    if (navigator.share) {
      try {
        await navigator.share({
          title: guideContent.guida_titolo,
          text: shareText,
          url: shareUrl
        });
      } catch (err) {
        console.error("Errore condivisione:", err);
      }
    } else {
      navigator.clipboard.writeText(shareText + " " + shareUrl);
      notify("Link copiato negli appunti!");
    }
  };

  const handlePlayGuidePodcast = async () => {
    if (!guideContent || playingPodcast) return;

    // Stesso endpoint del podcast dell'itinerario, quindi stesso prezzo:
    // prima era gratuito e illimitato solo perché chiamato da qui.
    const confirmed = await creditConfirm.requestConfirmation(
      PRICING_LIST.podcast_daily,
      language === 'IT' ? 'Podcast della Guida' : 'Guide Podcast'
    );
    if (!confirmed) return;

    setPlayingPodcast(true);
    try {
      const tappe = guideContent.giorni.flatMap(g => g.pois).map(p => ({ name: p.titolo, description: p.descrizione_lunga }));
      // ADDEBITO SERVER-SIDE: la rotta scala/rimborsa i crediti e richiede il
      // token. Il client non addebita più (niente doppio addebito). Un giorno
      // reale, non "Intera Guida": dayNum va usato come numero per la cache.
      const res = await fetch(getApiUrl('/api/generate-daily-podcast'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getAccessToken()}`,
        },
        body: JSON.stringify({
          destination: guideContent.guida_titolo,
          dayNum: 1,
          tappe: tappe.slice(0, 10),
          language: language || 'it'
        })
      });
      if (res.status === 402) {
        setPlayingPodcast(false);
        notify(getTranslation('err_insufficient_credits', language));
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      notifyCreditsChanged({ userId });
      if (data.text) {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(data.text);
          utterance.lang = language === 'EN' ? 'en-US' : 'it-IT';
          utterance.onend = () => setPlayingPodcast(false);
          utterance.onerror = () => setPlayingPodcast(false);
          window.speechSynthesis.speak(utterance);
        }
      } else {
        setPlayingPodcast(false);
      }
    } catch (e) {
      console.error(e);
      setPlayingPodcast(false);
      notify(language === 'IT'
        ? "Errore nella generazione del podcast. Nessun credito è stato scalato."
        : "Podcast generation failed. No credits were charged.");
    }
  };

  // Export EPUB gratuito: il contenuto è già stato pagato e cachato lato server.
  const handleDownloadEpub = async () => {
    if (!guideContent || !guideHash || isEpubLoading) return;
    setIsEpubLoading(true);
    try {
      const ok = await downloadGuideAsEpub(guideHash, guideContent.guida_titolo, language);
      if (!ok) notify(language === 'IT' ? 'Export EPUB non riuscito. Riprova.' : 'EPUB export failed. Retry.');
    } catch (e) {
      console.error('[PremiumGuide] EPUB export failed:', e);
      notify(language === 'IT' ? 'Export EPUB non riuscito. Riprova.' : 'EPUB export failed. Retry.');
    } finally {
      setIsEpubLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!guideContent) return;
    setIsDownloading(true);
    try {
      const filename = `WIP_${guideContent.guida_titolo.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}.pdf`;
      const pdfBlob = await downloadGuideAsPdf(PDF_CONTAINER_ID, filename);
      if (pdfBlob && guideHash) {
        // Upload in background (non-blocking)
        uploadPdfToStorage(guideHash, pdfBlob).catch(console.error);
      }
    } finally {
      setIsDownloading(false);
    }
  };

  // ── Regenerate with different style ───────────────────────────────────────
  const handleRegenerate = () => {
    setGuideContent(null);
    setMediaManifest({});
    setGuideHash('');
    setErrorMsg('');
    setPhase('select_style');
  };

  return (
    <AnimatePresence>
      <motion.div
        key="premium-guide-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          key="premium-guide-panel"
          initial={{ opacity: 0, y: 60, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.97 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className={`w-full sm:max-w-2xl bg-[#fcfaf8] rounded-t-3xl sm:rounded-3xl flex flex-col print:max-h-none print:overflow-visible print:shadow-none ${
            isDownloading ? 'overflow-visible' : 'overflow-hidden'
          }`}
          style={{ maxHeight: isDownloading ? 'none' : '92dvh' }}
        >

          {/* ── Header ── */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-outline-variant flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center text-secondary">
                <span className="text-lg">📖</span>
              </div>
              <div>
                <h2 className="text-base font-black text-primary">
                  {getTranslation('premium_guide_title', language)}
                </h2>
                {creditsLeft !== null && (
                  <p className="text-[11px] text-[#1e3a8a] mt-0.5">
                    {creditsLeft} {getTranslation('premium_guide_credits_left', language)}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-[#f8f5f0] text-[#1e3a8a] hover:bg-outline-variant transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── Content (scrollable) ── */}
          <div className={`flex-1 print:overflow-visible print:h-auto ${isDownloading ? '' : 'overflow-y-auto'}`}>

            {/* ── PHASE: select_style ── */}
            {phase === 'select_style' && (
              <div className="p-5">
                <p className="text-sm font-semibold text-[#1e3a8a]/70 mb-4">
                  {getTranslation('premium_guide_subtitle', language)}
                </p>

                {/* Style cards */}
                <div className="grid grid-cols-1 gap-3">
                  {STYLES.map((style) => {
                    const meta = GUIDE_STYLE_META[style];
                    const isSelected = selectedStyle === style;
                    return (
                      <button
                        key={style}
                        onClick={() => setSelectedStyle(style)}
                        className={`flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all duration-200 active:scale-[0.98] ${
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-outline-variant bg-[#f8f5f0] hover:border-outline-variant/80'
                        }`}
                      >
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                          style={{ background: `${meta.color}15` }}
                        >
                          {meta.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-sm text-[#1e3a8a]">
                              {getTranslation(`premium_guide_style_${style}`, language)}
                            </span>
                            {isSelected && (
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ background: meta.color }}
                              />
                            )}
                          </div>
                          <p className="text-xs text-[#1e3a8a] mt-0.5 leading-relaxed">
                            {getTranslation(`premium_guide_style_${style}_desc`, language)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Dedica regalo (opzionale): versione stampabile/condivisibile */}
                <div className="mt-5">
                  <label className="block text-xs font-black text-[#1e3a8a] mb-1.5">
                    🎁 Dedica (opzionale)
                  </label>
                  <input
                    type="text"
                    value={dedica}
                    onChange={(e) => setDedica(e.target.value)}
                    maxLength={300}
                    placeholder='Es. "A Maria, per i tuoi 50 anni — Fabrizio"'
                    className="w-full px-4 py-3 rounded-2xl border-2 border-outline-variant bg-[#f8f5f0] text-sm text-[#1e3a8a] placeholder:text-[#1e3a8a]/40 focus:border-primary focus:outline-none transition-colors"
                  />
                  <p className="text-[10px] text-[#1e3a8a]/50 mt-1">
                    Appare in copertina con stile elegante: perfetta per la guida-regalo. Costo invariato.
                  </p>
                </div>

                {/* Generate button */}
                <button
                  onClick={handleGenerate}
                  // Il vecchio disabled={false} lasciava una finestra per il
                  // doppio click tra la conferma crediti e il cambio di fase
                  disabled={phase !== 'select_style'}
                  className="mt-6 w-full py-4 rounded-2xl bg-primary text-secondary font-black text-sm tracking-wide shadow-lg shadow-primary/25 hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <span>{GUIDE_STYLE_META[selectedStyle].emoji}</span>
                  <span>{getTranslation('premium_guide_btn', language)}</span>
                </button>
              </div>
            )}

            {/* ── PHASE: generating ── */}
            {phase === 'generating' && (
              <LoadingQuiz 
                destination={itinerary.city || 'questa città'} 
                quizLength={8} 
                userId={userId} 
                language={language} 
              />
            )}

            {/* ── PHASE: error ── */}
            {phase === 'error' && (
              <div className="flex flex-col items-center justify-center px-8 py-14 text-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#1e3a8a] mb-2">Oops!</h3>
                  <p className="text-sm text-[#1e3a8a] max-w-xs leading-relaxed">{errorMsg}</p>
                </div>
                <button
                  onClick={handleRegenerate}
                  className="px-6 py-3 rounded-2xl border-2 border-primary text-primary font-bold text-sm hover:bg-primary/5 transition-colors"
                >
                  Torna indietro
                </button>
              </div>
            )}

            {/* ── PHASE: preview ── */}
            {phase === 'preview' && guideContent && (
              <div>
                {/* Action bar */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-outline-variant bg-[#f8f5f0]">
                  <p className="text-sm font-bold text-[#0a6c44] flex items-center gap-1.5">
                    <span>✓</span>
                    <span>{getTranslation('premium_guide_ready', language)}</span>
                  </p>
                  <div className="flex gap-2">
                    
                    <button
                      onClick={() => handleShareGuide()}
                      className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      title="Condividi Guida"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                    </button>
                    <button
                      onClick={handlePlayGuidePodcast}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 text-primary text-xs font-black shadow-sm hover:bg-primary/20 transition-all"
                    >
                      {playingPodcast ? "In riproduzione" : "🎧 Podcast"}
                    </button>
                    {/* EPUB gratuito: la guida esiste già, niente nuovo addebito */}
                    {guideHash && (
                      <button
                        onClick={handleDownloadEpub}
                        disabled={isEpubLoading}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 text-primary text-xs font-black shadow-sm hover:bg-primary/20 transition-all disabled:opacity-60"
                        title="Scarica la guida in formato EPUB (gratuito)"
                      >
                        {isEpubLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '📖'} EPUB
                      </button>
                    )}
                    <button
                      onClick={handleRegenerate}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-outline-variant bg-[#fcfaf8] text-xs font-semibold text-[#1e3a8a] hover:border-outline-variant/80 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      {getTranslation('premium_guide_regenerate', language)}
                    </button>
                    <button
                      onClick={handleDownloadPdf}
                      disabled={isDownloading}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-secondary text-xs font-black shadow-md hover:bg-primary/90 active:scale-[0.97] transition-all disabled:opacity-60"
                    >
                      {isDownloading
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Download className="w-3.5 h-3.5" />
                      }
                      {getTranslation('premium_guide_download', language)}
                    </button>
                  </div>
                </div>

                {/* Guide preview */}
                <div className="p-4 bg-[#f8f5f0]">
                  <div className="rounded-xl overflow-hidden shadow-xl">
                    <PremiumGuideRenderer
                      content={guideContent}
                      mediaManifest={mediaManifest}
                      language={language}
                      containerId={PDF_CONTAINER_ID}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* MODAL CREDITI */}
      <CreditConfirmationModal 
        isOpen={creditConfirm.isOpen}
        onClose={creditConfirm.handleCancel}
        onConfirm={creditConfirm.handleConfirm}
        onBuyCredits={() => {
           creditConfirm.handleCancel();
           setShowShop(true);
        }}
        cost={creditConfirm.cost}
        currentBalance={currentBalance}
        serviceName={creditConfirm.serviceName}
        language={language}
      />

      {/* SHOP CREDITI (dal ramo "Crediti Insufficienti") */}
      {showShop && (
        <motion.div
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed inset-0 z-[10001] bg-white"
        >
          <ShopScreen userId={userId} language={language} onClose={() => setShowShop(false)} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

