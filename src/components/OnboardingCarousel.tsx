import React, { useState } from 'react';
import { Map, Headphones, Compass, ArrowRight, Check } from 'lucide-react';
import { useSwipeable } from 'react-swipeable';
import { motion, AnimatePresence } from 'motion/react';
import { Language } from '../lib/i18n';

interface OnboardingProps {
  onComplete: () => void;
  language?: Language;
}

export const OnboardingCarousel: React.FC<OnboardingProps> = ({ onComplete, language = 'IT' }) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    {
      tag: language === 'IT' ? "ESPLORAZIONE AI" : "AI EXPLORATION",
      icon: <Compass className="w-12 h-12 text-[#d4af37]" strokeWidth={1.5} />,
      title: language === 'IT' ? (
        <>
          Esplora come un <span className="bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_2px_10px_rgba(212,175,55,0.2)]">Local</span>
        </>
      ) : (
        <>
          Explore like a <span className="bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_2px_10px_rgba(212,175,55,0.2)]">Local</span>
        </>
      ),
      description: language === 'IT' 
        ? "Genera itinerari su misura in pochi secondi grazie all'Intelligenza Artificiale. WIP trova le gemme nascoste e i percorsi ottimali intorno a te."
        : "Generate tailored itineraries in seconds with Artificial Intelligence. WIP finds hidden gems and optimal routes around you.",
      glowColor: "rgba(99, 102, 241, 0.18)" // Indigo glow
    },
    {
      tag: language === 'IT' ? "AUDIO GUIDA PREMIUM" : "PREMIUM AUDIO GUIDE",
      icon: <Headphones className="w-12 h-12 text-[#d4af37]" strokeWidth={1.5} />,
      title: language === 'IT' ? (
        <>
          Il Tuo <span className="bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_2px_10px_rgba(212,175,55,0.2)]">Narratore</span> Personale
        </>
      ) : (
        <>
          Your Personal <span className="bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_2px_10px_rgba(212,175,55,0.2)]">Storyteller</span>
        </>
      ),
      description: language === 'IT'
        ? "Non leggere lo schermo del telefono mentre cammini. Lascia che la nostra voce narrante ti guidi passo passo, raccontandoti la storia del luogo."
        : "Put your phone down as you walk. Let our storytelling voice guide you step-by-step, revealing the deep history of each spot.",
      glowColor: "rgba(236, 72, 153, 0.18)" // Pink/Rose glow
    },
    {
      tag: language === 'IT' ? "VIAGGIO OFFLINE" : "OFFLINE EXPEDITIONS",
      icon: <Map className="w-12 h-12 text-[#d4af37]" strokeWidth={1.5} />,
      title: language === 'IT' ? (
        <>
          Viaggia senza <span className="bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_2px_10px_rgba(212,175,55,0.2)]">Limiti</span>
        </>
      ) : (
        <>
          Travel without <span className="bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_2px_10px_rgba(212,175,55,0.2)]">Limits</span>
        </>
      ),
      description: language === 'IT'
        ? "Salva i tuoi percorsi in locale per navigare le mappe anche offline. Colleziona le tappe visitate per un'esperienza di viaggio lussuosa e indimenticabile."
        : "Save your routes locally to navigate maps offline. Collect visited stops for a luxurious, seamless, and unforgettable journey.",
      glowColor: "rgba(16, 185, 129, 0.18)" // Emerald glow
    }
  ];

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  const handleDotClick = (idx: number) => {
    setCurrentSlide(idx);
  };

  const handlers = useSwipeable({
    onSwipedLeft: () => handleNext(),
    onSwipedRight: () => setCurrentSlide(prev => Math.max(0, prev - 1)),
    trackMouse: true
  });

  return (
    <div 
      className="fixed inset-0 z-[100] flex flex-col bg-[#07090e] text-white select-none overflow-hidden transition-all duration-700 ease-in-out" 
      style={{
        backgroundImage: `
          radial-gradient(circle at 80% 20%, ${slides[currentSlide].glowColor} 0%, transparent 60%),
          radial-gradient(circle at 20% 80%, rgba(212, 175, 55, 0.05) 0%, transparent 60%)
        `
      }}
      {...handlers}
    >
      {/* Subtle fine ambient grid overlay for tech/premium texture */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none opacity-60" />

      {/* Header element - Elegant WIP logo placeholder */}
      <div className="pt-8 px-8 flex justify-center shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xl font-serif font-black tracking-[0.2em] text-[#d4af37]">WIP</span>
          <div className="w-1.5 h-1.5 bg-[#d4af37] rounded-full animate-pulse" />
          <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 pl-1">Premium</span>
        </div>
      </div>

      {/* Main presentation area */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-10 relative z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30, scale: 0.95 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md mx-auto flex flex-col items-center text-center space-y-8"
          >
            {/* Animated gold glowing icon ring */}
            <div className="relative flex items-center justify-center">
              {/* Outer pulsing glass border */}
              <motion.div
                animate={{ scale: [1, 1.12, 1], opacity: [0.3, 0.6, 0.3] }}
                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                className="absolute w-36 h-36 rounded-full border border-[#d4af37]/25 blur-sm"
              />
              {/* Inner container */}
              <div className="w-28 h-28 rounded-full bg-gradient-to-br from-slate-950 to-slate-900 border-2 border-[#d4af37]/40 flex items-center justify-center shadow-[0_0_40px_rgba(212,175,55,0.12)] relative">
                {slides[currentSlide].icon}
              </div>
            </div>

            {/* Content Details */}
            <div className="space-y-4">
              <span className="inline-block text-[9px] font-black tracking-[0.3em] text-[#d4af37] bg-[#d4af37]/10 px-4 py-1.5 rounded-full border border-[#d4af37]/25 uppercase shadow-inner">
                {slides[currentSlide].tag}
              </span>

              <h2 className="text-3xl sm:text-4xl font-serif font-black text-white tracking-tight leading-[1.25] px-2">
                {slides[currentSlide].title}
              </h2>

              <p className="text-white/60 text-sm sm:text-base leading-relaxed max-w-sm mx-auto font-medium px-4">
                {slides[currentSlide].description}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer controls & indicators */}
      <div className="pb-10 pt-4 flex flex-col items-center px-8 relative z-10 shrink-0">
        {/* Pagination Dots */}
        <div className="flex gap-2.5 mb-8">
          {slides.map((_, idx) => (
            <button 
              key={idx} 
              onClick={() => handleDotClick(idx)}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                currentSlide === idx 
                  ? 'w-7 bg-gradient-to-r from-amber-400 to-[#d4af37] shadow-[0_0_12px_rgba(212,175,55,0.4)]' 
                  : 'w-1.5 bg-white/20 hover:bg-white/45'
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
        
        {/* Navigation buttons */}
        <div className="w-full max-w-md flex justify-between items-center px-4">
          <button 
            onClick={onComplete}
            className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40 hover:text-white/95 transition-all p-3"
          >
            {language === 'IT' ? 'Salta' : 'Skip'}
          </button>
          
          <button 
            onClick={handleNext}
            className="flex items-center gap-2 bg-gradient-to-r from-amber-500 via-[#d4af37] to-amber-600 hover:from-amber-600 hover:to-amber-700 active:from-amber-700 active:to-amber-800 text-slate-950 px-7 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20 active:scale-95 transition-all duration-300"
          >
            {currentSlide === slides.length - 1 ? (
              <>
                {language === 'IT' ? 'Inizia' : 'Enter'} <Check className="w-4 h-4 text-slate-950" strokeWidth={3} />
              </>
            ) : (
              <>
                {language === 'IT' ? 'Avanti' : 'Next'} <ArrowRight className="w-4 h-4 text-slate-950" strokeWidth={3} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
