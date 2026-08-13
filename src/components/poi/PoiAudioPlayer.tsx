import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Megaphone, Loader2, Sparkles, Headphones,
  RotateCcw, Pause, Play, RotateCw, Square, Moon, History, Mic, X, Send
} from 'lucide-react';
import { getTranslation, Language } from '../../lib/i18n';
import { useAudioState } from '../../hooks/useAudioState';
import { locationService } from '../../services/locationService';
import { getApiUrl } from '../../lib/api';

export type GuideRegister = 'standard' | 'breve' | 'bambini';

interface PoiAudioPlayerProps {
  localGuideMode: "nicky" | "dante";
  setLocalGuideMode: (mode: "nicky" | "dante") => void;
  guideRegister: GuideRegister;
  setGuideRegister: (r: GuideRegister) => void;
  isLoading: boolean;
  isRegenerating: boolean;
  generatedText: string | null;
  poi: any;
  wikiData: any;
  language: Language;
  onToggleSpeech: () => void;
  onRegenerate: () => void;
}

// Lingue del riconoscimento vocale per «Chiedi mentre ascolti»
const SPEECH_LANGS: Record<string, string> = {
  IT: 'it-IT', EN: 'en-US', FR: 'fr-FR', ES: 'es-ES', DE: 'de-DE', RU: 'ru-RU', ZH: 'zh-CN',
};

// ── Riprendi da dove eri (ondata 3) ──────────────────────────────────────
// Posizioni di ascolto per POI in localStorage: sopravvivono a chiusure e
// giorni di distanza. Si salvano ogni ~3s durante l'ascolto e si cancellano
// a riproduzione quasi completata.
const POS_KEY = 'wip_audio_positions';
const loadPositions = (): Record<string, { t: number; d: number; at: number }> => {
  try { return JSON.parse(localStorage.getItem(POS_KEY) || '{}') || {}; } catch { return {}; }
};
const savePosition = (poiId: string, t: number, d: number) => {
  try {
    const all = loadPositions();
    all[poiId] = { t: Math.floor(t), d: Math.floor(d), at: Date.now() };
    // Tetto a 80 voci: si scartano le più vecchie
    const keys = Object.keys(all);
    if (keys.length > 80) {
      keys.sort((a, b) => (all[a].at || 0) - (all[b].at || 0)).slice(0, keys.length - 80).forEach(k => delete all[k]);
    }
    localStorage.setItem(POS_KEY, JSON.stringify(all));
  } catch { /* storage bloccato: niente ripresa, non è un errore */ }
};
const clearPosition = (poiId: string) => {
  try {
    const all = loadPositions();
    if (all[poiId]) { delete all[poiId]; localStorage.setItem(POS_KEY, JSON.stringify(all)); }
  } catch { /* best effort */ }
};

export default function PoiAudioPlayer({
  localGuideMode,
  setLocalGuideMode,
  guideRegister,
  setGuideRegister,
  isLoading,
  isRegenerating,
  generatedText,
  poi,
  wikiData,
  language,
  onToggleSpeech,
  onRegenerate
}: PoiAudioPlayerProps) {
  const audioState = useAudioState();

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleSpeedToggle = () => {
    const next = audioState.playbackSpeed === 1 ? 1.5 : audioState.playbackSpeed === 1.5 ? 2 : 1;
    locationService.setPlaybackSpeed(next);
  };

  const isCurrentPoi = audioState.poiId === String(poi.id);

  // ── Testo mostrato + trascrizione sincronizzata ───────────────────────
  const displayText: string = isLoading || isRegenerating
    ? ''
    : (localGuideMode === "nicky"
        ? (generatedText || poi?.audioScript || (wikiData?.extract ? `Ciao! Sono Nicky. Ecco cosa c'è da sapere: ${wikiData.extract}` : "Ciao! Sono Nicky!"))
        : (generatedText || poi?.audioScript || wikiData?.extract || "Descrizione non disponibile."));

  // Frasi + posizione cumulativa in caratteri: senza timestamp reali del TTS
  // la sincronia è proporzionale (tempo/durata ≈ caratteri letti). Non è
  // karaoke perfetto ma segue il filo del discorso ed è leggibile a volume 0.
  const sentences = useMemo(() => {
    const parts: string[] = String(displayText || '').match(/[^.!?…]+[.!?…]+["»']?\s*|[^.!?…]+$/g) || [];
    let cum = 0;
    const total = parts.reduce((s, p) => s + p.length, 0) || 1;
    return parts.map(p => {
      const start = cum / total;
      cum += p.length;
      return { text: p, start, end: cum / total };
    });
  }, [displayText]);

  const playRatio = isCurrentPoi && audioState.duration > 0 ? audioState.currentTime / audioState.duration : -1;
  const activeSentence = playRatio >= 0 ? sentences.findIndex(s => playRatio >= s.start && playRatio < s.end) : -1;
  const activeRef = useRef<HTMLSpanElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Auto-scroll della frase corrente dentro il riquadro (mai della pagina)
    if (activeRef.current && transcriptRef.current) {
      const el = activeRef.current, box = transcriptRef.current;
      const target = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
      box.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    }
  }, [activeSentence]);

  // ── Riprendi: salvataggio posizione + chip ────────────────────────────
  const [savedPos, setSavedPos] = useState<{ t: number; d: number } | null>(() => {
    const p = loadPositions()[String(poi.id)];
    return p ? { t: p.t, d: p.d } : null;
  });
  useEffect(() => {
    if (!isCurrentPoi || !audioState.isPlaying || !audioState.duration) return;
    if (audioState.currentTime / audioState.duration >= 0.97) {
      clearPosition(String(poi.id));
      setSavedPos(null);
    } else if (audioState.currentTime > 5) {
      savePosition(String(poi.id), audioState.currentTime, audioState.duration);
    }
    // Il "tick" ogni ~3s: currentTime cambia di continuo, il floor lo campiona
  }, [isCurrentPoi, audioState.isPlaying, Math.floor(audioState.currentTime / 3)]);

  const showResume = !!savedPos && savedPos.t > 20 &&
    isCurrentPoi && audioState.duration > 0 &&
    savedPos.t < audioState.duration * 0.95 &&
    (savedPos.t - audioState.currentTime) > 10;

  const doResume = () => {
    if (!savedPos) return;
    // seek è relativo (web e nativo): il delta porta alla posizione salvata
    locationService.seek(savedPos.t - audioState.currentTime);
  };

  // ── «Chiedi mentre ascolti» (ondata 4) ────────────────────────────────
  // Pausa, domanda (a voce dove il browser lo consente, altrimenti testo),
  // risposta generata da /api/regenerate col personaggio attivo e letta dal
  // TTS. La posizione dell'ascolto resta salvata: si riprende col chip.
  const [askOpen, setAskOpen] = useState(false);
  const [askQuestion, setAskQuestion] = useState('');
  const [askAnswer, setAskAnswer] = useState('');
  const [askBusy, setAskBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const speechSupported = typeof window !== 'undefined' && !!((window as any).webkitSpeechRecognition || (window as any).SpeechRecognition);

  const openAsk = () => {
    if (audioState.isPlaying && isCurrentPoi) onToggleSpeech(); // pausa
    setAskAnswer('');
    setAskQuestion('');
    setAskOpen(true);
  };

  const startListening = () => {
    try {
      const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      if (!SR) return;
      const rec = new SR();
      recognitionRef.current = rec;
      rec.lang = SPEECH_LANGS[String(language)] || 'it-IT';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (e: any) => {
        const said = e.results?.[0]?.[0]?.transcript || '';
        setAskQuestion(prev => (prev ? `${prev} ${said}` : said));
        setListening(false);
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => setListening(false);
      setListening(true);
      rec.start();
    } catch { setListening(false); }
  };

  const doAsk = async () => {
    const q = askQuestion.trim();
    if (q.length < 3 || askBusy) return;
    setAskBusy(true);
    setAskAnswer('');
    try {
      const res = await fetch(getApiUrl('/api/regenerate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${displayText}\n\nDOMANDA DEL VISITATORE mentre ascolta la guida (rispondi SOLO e direttamente a questa domanda, massimo 120 parole): "${q}"`,
          poiName: poi?.name,
          mode: localGuideMode,
          previousText: displayText || undefined,
          lang: language,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const answer = String(data?.result || '').trim();
      if (!answer) throw new Error('Risposta vuota');
      setAskAnswer(answer);
      // La risposta viene letta con la voce del personaggio; id dedicato per
      // non sporcare la posizione salvata dell'audioguida principale.
      locationService.playAudio(answer, `${poi?.name} — risposta`, poi?.category, `${String(poi?.id)}_ask`, localGuideMode);
    } catch {
      setAskAnswer('Non sono riuscito a rispondere ora: riprova tra qualche istante.');
    } finally {
      setAskBusy(false);
    }
  };

  // ── Sleep timer ───────────────────────────────────────────────────────
  const [sleepMin, setSleepMin] = useState(0);
  const sleepArmedAt = useRef(0);
  const cycleSleep = () => {
    const next = sleepMin === 0 ? 10 : sleepMin === 10 ? 20 : sleepMin === 20 ? 30 : 0;
    setSleepMin(next);
    sleepArmedAt.current = Date.now();
  };
  useEffect(() => {
    if (!sleepMin) return;
    const id = setInterval(() => {
      if (Date.now() - sleepArmedAt.current >= sleepMin * 60000) {
        locationService.stopGuideAudio();
        setSleepMin(0);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [sleepMin]);

  return (
    <div className="relative bg-white rounded-[2rem] p-6 mb-8 border border-secondary shadow-xl shadow-secondary/5 overflow-hidden">
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-secondary/10 blur-[80px] rounded-full" />

      <div className="relative z-10">
        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="flex items-center gap-2 mb-3 bg-[#fdfbf7] p-1 rounded-full w-fit">
              <button
                onClick={() => setLocalGuideMode("nicky")}
                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${
                  localGuideMode === "nicky" ? "bg-secondary text-white shadow-md" : "text-[#1e3a8a]/60"
                }`}
              >
                Nicky
              </button>
              <button
                onClick={() => setLocalGuideMode("dante")}
                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${
                  localGuideMode === "dante" ? "bg-primary text-white shadow-md" : "text-[#1e3a8a]/60"
                }`}
              >
                Dante
              </button>
            </div>

            {/* Registro (ondata 4): versione standard, breve (~40s) o per
                bambini — generata on-demand e cachata per registro */}
            <div className="flex items-center gap-1.5 mb-3 bg-[#fdfbf7] p-1 rounded-full w-fit">
              {([['standard', 'Standard'], ['breve', '⚡ Breve'], ['bambini', '🧒 Bimbi']] as [GuideRegister, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setGuideRegister(key)}
                  disabled={isLoading || isRegenerating}
                  className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider transition-all disabled:opacity-50 ${
                    guideRegister === key ? "bg-[#1e3a8a] text-white shadow-md" : "text-[#1e3a8a]/50 hover:text-[#1e3a8a]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <h3 className="text-xl font-black text-[#1e3a8a] flex items-center gap-3">
              <img
                src={localGuideMode === "nicky" ? "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop" : "/Portrait_de_Dante.jpg"}
                className={`w-8 h-8 rounded-full object-cover border-2 shadow-sm ${localGuideMode === "nicky" ? "border-secondary" : "border-primary"} bg-white object-top`}
                alt={localGuideMode}
              />
              {localGuideMode === "nicky" ? `Nicky: ${poi.name} Vibes` : `Dante: ${poi.name}`}
            </h3>
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={openAsk}
              disabled={isLoading || isRegenerating || !displayText}
              className="px-3 py-2 rounded-xl text-xs font-black transition-colors flex items-center gap-1.5 bg-primary text-white shadow-sm disabled:opacity-50"
              title="Metti in pausa e fai una domanda sul luogo: risponde la guida"
            >
              <Mic className="w-4 h-4" />
              CHIEDI
            </button>
            <button
              onClick={() => locationService.setMegaphone(!audioState.isMegaphone)}
              className={`px-3 py-2 rounded-xl text-xs font-black transition-colors flex items-center gap-1.5 ${audioState.isMegaphone ? "bg-secondary text-white shadow-sm" : "bg-[#f8f5f0]/60 hover:bg-[#f8f5f0]"}`}
            >
              <Megaphone className="w-4 h-4" />
              MEGAPHONE
            </button>
          </div>
        </div>

        {/* Trascrizione sincronizzata: la frase in ascolto si evidenzia e
            resta centrata nel riquadro; a volume zero si legge come un libro */}
        <div
          ref={transcriptRef}
          className="text-[14px] text-[#1e3a8a]/90 leading-relaxed font-medium mb-8 bg-[#f8f5f0]/5 p-4 rounded-2xl italic border-l-4 border-secondary/20 max-h-56 overflow-y-auto scroll-smooth"
        >
          {isLoading || isRegenerating ? (
            <div className="flex items-center gap-3 py-4">
              <Loader2 className="w-5 h-5 animate-spin text-secondary" />
              <span className="font-bold">
                {isRegenerating ? getTranslation("regenerating_label", language) : getTranslation("loading_dots", language)}
              </span>
            </div>
          ) : sentences.length > 0 ? (
            sentences.map((s, i) => (
              <span
                key={i}
                ref={i === activeSentence ? activeRef : undefined}
                className={i === activeSentence
                  ? "bg-secondary/15 text-[#1e3a8a] font-bold not-italic rounded px-0.5 transition-colors"
                  : "transition-colors"}
              >
                {s.text}
              </span>
            ))
          ) : (
            displayText
          )}
        </div>

        {/* Riprendi da dove eri: appare se c'è una posizione salvata più avanti */}
        {showResume && savedPos && (
          <button
            onClick={doResume}
            className="w-full mb-4 flex items-center justify-center gap-2 px-4 py-2.5 bg-secondary/10 hover:bg-secondary/20 text-[#1e3a8a] rounded-xl text-xs font-black transition-colors"
          >
            <History className="w-4 h-4" />
            Riprendi da {formatTime(savedPos.t)}
          </button>
        )}

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="relative h-2 bg-on-surface-variant/10 rounded-full overflow-hidden mb-2">
            <motion.div
              className="absolute inset-y-0 left-0 bg-secondary"
              animate={{ width: `${isCurrentPoi ? audioState.progress : 0}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] font-black text-[#1e3a8a]">
            <span>{isCurrentPoi ? formatTime(audioState.currentTime) : "00:00"}</span>
            <span className="flex items-center gap-2">
              {!isCurrentPoi && savedPos && savedPos.t > 20 && (
                <span className="text-[#1e3a8a]/50 font-bold normal-case">eri a {formatTime(savedPos.t)}</span>
              )}
              {isCurrentPoi && audioState.duration ? formatTime(audioState.duration) : "00:00"}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 mb-4 text-primary/70 bg-primary/5 py-2 px-4 rounded-xl border border-primary/10">
          <Headphones className="w-4 h-4 shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-wide text-center">Usa le cuffie per un'esperienza ottimale</span>
        </div>

        <div className="flex items-center justify-center gap-6 mb-8">
          <button onClick={() => locationService.restart()} className="text-[#1e3a8a] hover:text-secondary flex flex-col items-center gap-1">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
              <RotateCcw className="w-6 h-6" />
            </div>
            <span className="text-[9px] font-bold uppercase">{getTranslation("restart_btn", language)}</span>
          </button>

          <button
            onClick={onToggleSpeech}
            disabled={(!wikiData?.extract && !generatedText) || isLoading || isRegenerating}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-xl active:scale-90 ${
              (audioState.isPlaying && isCurrentPoi) ? "bg-red-500 shadow-red-200" : "bg-secondary shadow-secondary/30"
            }`}
          >
            {(audioState.isPlaying && isCurrentPoi) ? <Pause className="w-10 h-10 text-white fill-current" /> : <Play className="w-10 h-10 text-white fill-current translate-x-1" />}
          </button>

          <button onClick={() => locationService.seek(10)} className="text-[#1e3a8a] hover:text-secondary flex flex-col items-center gap-1">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
              <RotateCw className="w-6 h-6" />
            </div>
            <span className="text-[9px] font-bold uppercase">{getTranslation("forward_10s", language)}</span>
          </button>

          {/* Velocità tra i controlli principali: il vecchio "1x" in alto a
              destra era piccolo e fuori dalla zona dei comandi di ascolto. */}
          <button
            onClick={handleSpeedToggle}
            aria-label={`Velocità di riproduzione: ${audioState.playbackSpeed}x`}
            className="text-[#1e3a8a] hover:text-secondary flex flex-col items-center gap-1"
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-black transition-all active:scale-95 ${
              audioState.playbackSpeed !== 1 ? "bg-secondary text-white shadow-md" : "bg-blue-50"
            }`}>
              {audioState.playbackSpeed}x
            </div>
            <span className="text-[9px] font-bold uppercase">Velocità</span>
          </button>

          {/* Sleep timer: off → 10' → 20' → 30' → off. Allo scadere l'audio
              si ferma da solo (standard dei player, comodo in hotel la sera). */}
          <button
            onClick={cycleSleep}
            aria-label={sleepMin ? `Sleep timer attivo: ${sleepMin} minuti` : 'Sleep timer spento'}
            className="text-[#1e3a8a] hover:text-secondary flex flex-col items-center gap-1"
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95 ${
              sleepMin ? "bg-primary text-white shadow-md" : "bg-blue-50"
            }`}>
              {sleepMin ? <span className="text-xs font-black">{sleepMin}'</span> : <Moon className="w-6 h-6" />}
            </div>
            <span className="text-[9px] font-bold uppercase">Sleep</span>
          </button>
        </div>

        <div className="flex justify-center mb-6">
          <button
            onClick={() => locationService.stopGuideAudio()}
            className="flex items-center gap-2 px-6 py-2.5 bg-red-100 hover:bg-red-200 text-red-700 font-black rounded-xl transition-all"
          >
            <Square className="w-4 h-4 fill-current" />
            {getTranslation("stop_audio", language)}
          </button>
        </div>

        <div className="flex flex-col items-center gap-4 pt-4 border-t border-amber-100/50">
          <button
            onClick={onRegenerate}
            disabled={isRegenerating}
            className="flex items-center gap-2 text-secondary font-black text-xs hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            {isRegenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {getTranslation("listen_deep", language)}
          </button>
        </div>
      </div>

      {/* «Chiedi mentre ascolti»: domanda a voce o testo, risposta parlata */}
      <AnimatePresence>
        {askOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1400] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => setAskOpen(false)}
          >
            <div
              className="w-full max-w-md bg-white rounded-3xl p-5 space-y-3 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h4 className="font-black text-[#1e3a8a] text-sm">
                  Chiedi a {localGuideMode === 'nicky' ? 'Nicky' : 'Dante'} su {poi?.name}
                </h4>
                <button onClick={() => setAskOpen(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
              </div>

              <div className="flex gap-2">
                <input
                  value={askQuestion}
                  onChange={e => setAskQuestion(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') doAsk(); }}
                  placeholder={listening ? 'Ti ascolto…' : 'Es. In che anno è stato costruito?'}
                  className="flex-1 bg-[#f8f5f0] border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800"
                />
                {speechSupported && (
                  <button
                    onClick={startListening}
                    disabled={listening}
                    className={`p-2.5 rounded-xl transition-colors ${listening ? 'bg-red-500 text-white animate-pulse' : 'bg-[#1e3a8a] text-white'}`}
                    title="Fai la domanda a voce"
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={doAsk}
                  disabled={askBusy || askQuestion.trim().length < 3}
                  className="p-2.5 rounded-xl bg-secondary text-white disabled:opacity-50"
                  title="Invia la domanda"
                >
                  {askBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>

              {askAnswer && (
                <div className="bg-[#f8f5f0] rounded-2xl p-3 text-sm text-[#1e3a8a]/90 leading-relaxed max-h-48 overflow-y-auto">
                  {askAnswer}
                </div>
              )}
              <p className="text-[10px] text-gray-400">
                La risposta viene anche letta a voce. L'audioguida resta in pausa: al ritorno trovi il tasto «Riprendi».
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
