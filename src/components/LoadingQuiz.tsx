import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Brain, Check, X, Trophy, Sparkles } from 'lucide-react';
import { getTranslation } from '../lib/i18n';
import { addTriviaRewards } from '../lib/gamification';

import triviaDbIt from '../data/trivia_db.json';
import triviaDbEn from '../data/trivia_db_en.json';

interface TriviaQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface LoadingQuizProps {
  destination: string;
  quizLength?: number;
  userId: string;
  language?: string;
  /** Chiude il quiz lasciando proseguire la generazione: l'overlay è opaco
   *  a tutto schermo e nascondeva l'itinerario che si costruisce in streaming. */
  onDismiss?: () => void;
}

export default function LoadingQuiz({ destination, quizLength = 5, userId, language = 'it', onDismiss }: LoadingQuizProps) {
  const [questions, setQuestions] = useState<TriviaQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  
  // Usiamo un ref per i punti in modo da poterli inviare al server in modo sicuro 
  // anche se il componente viene smontato improvvisamente.
  const correctCount = useRef(0);
  const hasRewarded = useRef(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  /**
   * Focus trap: l'overlay copre tutta la schermata, ma senza trap il Tab
   * continuava a spostarsi sui controlli sottostanti (invisibili e non
   * utilizzabili). Esc chiude, se la chiusura è consentita.
   */
  useEffect(() => {
    const root = overlayRef.current;
    if (!root) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const selector = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const focusables = (): HTMLElement[] =>
      (Array.from(root.querySelectorAll(selector)) as HTMLElement[])
        .filter(el => el.offsetParent !== null);
    focusables()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onDismiss) {
        e.preventDefault();
        onDismiss();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [onDismiss, loading, isFinished, currentIdx]);

  useEffect(() => {
    let isMounted = true;
    
    function loadTrivia() {
      try {
        // Seleziona 'quizLength' domande casuali dal database locale
        // `language` arriva maiuscolo da i18n ('IT' | 'EN' | ...): il vecchio
        // confronto con 'en' minuscolo era sempre falso e il DB inglese non
        // veniva mai usato. Le lingue senza DB dedicato ricadono sull'inglese.
        const lang = (language || 'it').toLowerCase();
        const dbToUse = lang === 'it' ? triviaDbIt : triviaDbEn;
        const shuffled = [...dbToUse].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, quizLength);
        
        if (isMounted && selected.length > 0) {
          setQuestions(selected as TriviaQuestion[]);
          setLoading(false);
        }
      } catch (e) {
        console.warn("Trivia non disponibile per ora.", e);
        // Fallback al loader normale se fallisce
      }
    }
    
    // Un minuscolo ritardo per evitare un flash della UI troppo rapido
    setTimeout(loadTrivia, 300);

    // Cleanup function: invia i punti quando il componente viene distrutto (es. guida pronta)
    return () => {
      isMounted = false;
      if (correctCount.current > 0 && !hasRewarded.current) {
        hasRewarded.current = true;
        addTriviaRewards(userId, correctCount.current);
      }
    };
  }, [destination, quizLength, language, userId]);

  const handleSelect = (idx: number) => {
    if (selectedOption !== null || isFinished) return;
    
    setSelectedOption(idx);
    const isCorrect = idx === questions[currentIdx].correctIndex;
    
    if (isCorrect) {
      correctCount.current += 1;
    }
    
    setShowExplanation(true);
    
    setTimeout(() => {
      if (currentIdx + 1 < questions.length) {
        setShowExplanation(false);
        setSelectedOption(null);
        setCurrentIdx(prev => prev + 1);
      } else {
        setIsFinished(true);
        // Quiz finito dall'utente
        if (!hasRewarded.current) {
          hasRewarded.current = true;
          addTriviaRewards(userId, correctCount.current);
        }
      }
    }, 4000);
  };

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-[90] bg-black/85 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-white overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={getTranslation("wip_working", language as any) || "Elaborazione in corso..."}
    >

      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-primary/30 to-transparent blur-3xl pointer-events-none"></div>

      {/* Il quiz è un passatempo, non un muro: si può chiudere e guardare
          l'itinerario mentre viene generato. I punti già maturati vengono
          comunque inviati dalla cleanup dell'effect. */}
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label={getTranslation("close", language as any) || "Chiudi"}
          className="absolute top-4 right-4 z-20 min-w-[44px] min-h-[44px] px-4 flex items-center justify-center gap-2 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-black uppercase tracking-widest transition-colors backdrop-blur-md"
        >
          <X className="w-4 h-4" />
          {getTranslation("skip", language as any) || "Salta"}
        </button>
      )}

      {loading ? (
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          className="flex flex-col items-center text-center max-w-sm relative z-10"
        >
          <div className="w-24 h-24 mb-6 relative">
            <div className="absolute inset-0 border-4 border-primary/20 rounded-full animate-ping"></div>
            <div className="w-full h-full bg-primary/20 rounded-full flex items-center justify-center relative z-10 backdrop-blur-md">
              <Brain className="w-10 h-10 text-primary animate-pulse" />
            </div>
          </div>
          <h3 className="text-2xl font-black mb-2">{getTranslation("wip_working", language as any) || "Elaborazione in corso..."}</h3>
          <p className="text-white/70 font-medium">
            {getTranslation("vr_b_lq_preparing", language as any).replace('{dest}', destination)}
          </p>
          <Loader2 className="w-6 h-6 mt-6 text-primary animate-spin" />
        </motion.div>
      ) : isFinished ? (
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }} 
          animate={{ scale: 1, opacity: 1 }} 
          className="bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-[2rem] text-center max-w-sm w-full relative z-10"
        >
          <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
          <h2 className="text-2xl font-black mb-2">{getTranslation("vr_b_lq_done", language as any)}</h2>
          <p className="text-lg mb-6">{getTranslation("vr_b_lq_score", language as any).replace('{n}', String(correctCount.current)).replace('{t}', String(questions.length))}</p>

          <div className="bg-primary/20 p-4 rounded-xl mb-4">
             <p className="font-bold flex items-center justify-center gap-2">
               <Sparkles className="w-5 h-5 text-yellow-400" />
               {getTranslation("vr_b_lq_won", language as any).replace('{c}', String(correctCount.current)).replace('{xp}', String(correctCount.current * 20))}
             </p>
          </div>

          <p className="text-white/60 text-sm mt-4 italic animate-pulse">
            {getTranslation("vr_b_lq_final", language as any)}
          </p>
        </motion.div>
      ) : (
        <div className="w-full max-w-md relative z-10 flex flex-col h-full max-h-[80vh] justify-center">
          
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div className="bg-primary/20 text-primary px-4 py-1 rounded-full text-sm font-bold flex items-center gap-2 backdrop-blur-md">
              <Brain className="w-4 h-4" />
              {getTranslation("vr_b_lq_question", language as any).replace('{i}', String(currentIdx + 1)).replace('{t}', String(questions.length))}
            </div>
            <div className="bg-white/10 px-4 py-1 rounded-full text-sm font-bold flex items-center gap-2 backdrop-blur-md">
              <Sparkles className="w-4 h-4 text-yellow-400" />
              {getTranslation("vr_b_lq_points", language as any)} {correctCount.current * 20}
            </div>
          </div>
          
          {/* Question Card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIdx}
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              className="bg-white/10 backdrop-blur-md border border-white/20 rounded-[2rem] p-6 shadow-2xl"
            >
              <h3 className="text-xl font-bold mb-6 leading-tight">
                {questions[currentIdx].question}
              </h3>
              
              <div className="space-y-3">
                {questions[currentIdx].options.map((opt, i) => {
                  const isSelected = selectedOption === i;
                  const isCorrectAnswer = i === questions[currentIdx].correctIndex;
                  
                  let btnClass = "bg-white/5 hover:bg-white/15 border-white/10 text-white";
                  if (showExplanation) {
                    if (isCorrectAnswer) btnClass = "bg-green-500/20 border-green-500 text-green-300";
                    else if (isSelected) btnClass = "bg-red-500/20 border-red-500 text-red-300";
                    else btnClass = "bg-white/5 border-white/5 opacity-50";
                  } else if (isSelected) {
                    btnClass = "bg-primary/50 border-primary text-white";
                  }

                  return (
                    <button
                      key={i}
                      disabled={selectedOption !== null}
                      onClick={() => handleSelect(i)}
                      className={`w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between group ${btnClass}`}
                    >
                      <span className="font-medium text-[15px]">{opt}</span>
                      {showExplanation && isCorrectAnswer && <Check className="w-5 h-5 text-green-400" />}
                      {showExplanation && isSelected && !isCorrectAnswer && <X className="w-5 h-5 text-red-400" />}
                    </button>
                  );
                })}
              </div>

              <AnimatePresence>
                {showExplanation && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    className="mt-6 p-4 rounded-xl bg-white/5 border border-white/10"
                  >
                    <p className="text-sm text-white/80 leading-relaxed font-medium">
                      {questions[currentIdx].explanation}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </AnimatePresence>
          
        </div>
      )}
    </div>
  );
}
