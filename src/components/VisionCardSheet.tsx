import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, User, CalendarDays, Palette, MapPin, BookOpen, Landmark, Sparkles, Volume2, Pause, Loader2 } from 'lucide-react';
import { Language } from '../lib/i18n';
import { speakAudioguide, stopSpeech } from '../services/ttsService';
import { getGuideCharacter } from '../lib/guideSettings';

interface VisionCardSheetProps {
  card: any;           // risultato di /api/vision (+ image base64 lato client)
  language: Language;
  onClose: () => void;
}

/**
 * Scheda enciclopedica del riconoscimento Vision: foto scattata, artista,
 * anno, stile, descrizione, storia e curiosità. Non è un POI: vive in
 * vision_cards (salvata dal server) e questa è la sua vista.
 */
export default function VisionCardSheet({ card, language, onClose }: VisionCardSheetProps) {
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => { stopSpeech(); };
  }, []);

  const photo = card.image || card.photo_url || null;

  const chips = [
    { icon: User, label: card.autore, hide: !card.autore || card.autore === 'Ignoto' },
    { icon: CalendarDays, label: card.anno_produzione },
    { icon: Palette, label: card.stile, hide: !card.stile || card.stile === 'N/D' },
    { icon: MapPin, label: card.citta },
  ].filter(c => c.label && !c.hide);

  const handleAudio = async () => {
    if (audioLoading) return;
    if (audioPlaying) {
      stopSpeech();
      setAudioPlaying(false);
      return;
    }
    const text = card.spiegazione_audio || card.descrizione_dettagliata || card.descrizione_breve;
    if (!text) return;
    setAudioLoading(true);
    try {
      await speakAudioguide(text, (language || 'IT').toLowerCase(), getGuideCharacter(), () => setAudioPlaying(false));
      setAudioPlaying(true);
    } catch {
      setAudioPlaying(false);
    } finally {
      setAudioLoading(false);
    }
  };

  const Section = ({ icon: Icon, title, text }: { icon: any; title: string; text?: string | null }) => {
    if (!text) return null;
    return (
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-black uppercase tracking-wider text-primary">{title}</h3>
        </div>
        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{text}</p>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[2500] bg-black/60 backdrop-blur-sm flex items-end sm:items-center sm:justify-center">
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className="bg-white w-full sm:max-w-md max-h-[92vh] rounded-t-[2rem] sm:rounded-[2rem] overflow-hidden flex flex-col shadow-2xl"
      >
        {/* Hero foto */}
        <div className="relative h-56 shrink-0 bg-slate-200">
          {photo ? (
            <img src={photo} alt={card.nome} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Landmark className="w-14 h-14 text-slate-400" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="absolute bottom-3 left-4 right-16">
            <h2 className="text-white text-xl font-black leading-tight drop-shadow">{card.nome}</h2>
          </div>
          <button
            onClick={handleAudio}
            className="absolute -bottom-0 right-4 translate-y-0 w-11 h-11 rounded-full bg-primary text-white flex items-center justify-center shadow-lg active:scale-90 transition-transform"
            style={{ transform: 'translateY(50%)' }}
          >
            {audioLoading
              ? <Loader2 className="w-5 h-5 animate-spin" />
              : audioPlaying
                ? <Pause className="w-5 h-5" />
                : <Volume2 className="w-5 h-5" />}
          </button>
        </div>

        {/* Contenuto scrollabile */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pt-8 pb-6">
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {chips.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#f8f5f0] rounded-full text-[11px] font-bold text-primary">
                  <c.icon className="w-3.5 h-3.5" />
                  {c.label}
                </span>
              ))}
            </div>
          )}

          {card.descrizione_breve && (
            <p className="text-[15px] text-slate-800 font-medium leading-relaxed mb-5">{card.descrizione_breve}</p>
          )}

          <Section icon={BookOpen} title="Descrizione" text={card.descrizione_dettagliata} />
          <Section icon={Landmark} title="Storia" text={card.storia} />
          <Section icon={Sparkles} title="Curiosità" text={card.curiosita} />

          <p className="text-[10px] text-slate-400 text-center mt-2">
            Scheda generata dall'AI e salvata nella tua collezione.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
