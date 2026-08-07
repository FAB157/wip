import React from 'react';
import { motion } from 'motion/react';
import {
  Megaphone, Loader2, Sparkles, Headphones,
  RotateCcw, Pause, Play, RotateCw, Square
} from 'lucide-react';
import { getTranslation, Language } from '../../lib/i18n';
import { useAudioState } from '../../hooks/useAudioState';
import { locationService } from '../../services/locationService';

interface PoiAudioPlayerProps {
  localGuideMode: "nicky" | "dante";
  setLocalGuideMode: (mode: "nicky" | "dante") => void;
  isLoading: boolean;
  isRegenerating: boolean;
  generatedText: string | null;
  poi: any;
  wikiData: any;
  language: Language;
  onToggleSpeech: () => void;
  onRegenerate: () => void;
}

export default function PoiAudioPlayer({
  localGuideMode,
  setLocalGuideMode,
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

            <h3 className="text-xl font-black text-[#1e3a8a] flex items-center gap-3">
              <img
                src={localGuideMode === "nicky" ? "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop" : "/Portrait_de_Dante.jpg"}
                className={`w-8 h-8 rounded-full object-cover border-2 shadow-sm ${localGuideMode === "nicky" ? "border-secondary" : "border-primary"} bg-white object-top`}
                alt={localGuideMode}
              />
              {localGuideMode === "nicky" ? `Nicky: ${poi.name} Vibes` : `Dante: ${poi.name}`}
            </h3>
          </div>
          <div className="flex gap-3 items-center">
            <button
              onClick={() => locationService.setMegaphone(!audioState.isMegaphone)}
              className={`px-3 py-2 rounded-xl text-xs font-black transition-colors flex items-center gap-1.5 ${audioState.isMegaphone ? "bg-secondary text-white shadow-sm" : "bg-[#f8f5f0]/60 hover:bg-[#f8f5f0]"}`}
            >
              <Megaphone className="w-4 h-4" />
              MEGAPHONE
            </button>
          </div>
        </div>

        <div className="text-[14px] text-[#1e3a8a]/90 leading-relaxed font-medium mb-8 bg-[#f8f5f0]/5 p-4 rounded-2xl italic border-l-4 border-secondary/20">
          {isLoading || isRegenerating ? (
            <div className="flex items-center gap-3 py-4">
              <Loader2 className="w-5 h-5 animate-spin text-secondary" />
              <span className="font-bold">
                {isRegenerating ? getTranslation("regenerating_label", language) : getTranslation("loading_dots", language)}
              </span>
            </div>
          ) : localGuideMode === "nicky" ? (
            generatedText || poi?.audioScript || (wikiData?.extract ? `Ciao! Sono Nicky. Ecco cosa c'è da sapere: ${wikiData.extract}` : "Ciao! Sono Nicky!")
          ) : (
            generatedText || poi?.audioScript || wikiData?.extract || "Descrizione non disponibile."
          )}
        </div>

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
            <span>{isCurrentPoi && audioState.duration ? formatTime(audioState.duration) : "00:00"}</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 mb-4 text-primary/70 bg-primary/5 py-2 px-4 rounded-xl border border-primary/10">
          <Headphones className="w-4 h-4 shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-wide text-center">Usa le cuffie per un'esperienza ottimale</span>
        </div>

        <div className="flex items-center justify-center gap-8 mb-8">
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
    </div>
  );
}
