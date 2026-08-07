import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, X, Volume2 } from 'lucide-react';
import { locationService } from '../services/locationService';
import { pauseSpeech, resumeSpeech, stopSpeech } from '../services/ttsService';
import { useAudioState } from '../hooks/useAudioState';

export default function AudioPlayerBanner() {
  // Il banner deve seguire il player principale (locationService), che e' quello
  // usato da scheda POI e geofencing: prima ascoltava solo gli eventi di
  // ttsService e restava invisibile durante le audioguide.
  const audioState = useAudioState();

  // Narrazioni avviate da ttsService (PoiCard / popup mappa).
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [ttsVisible, setTtsVisible] = useState(false);

  useEffect(() => {
    const handleStateChange = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setTtsVisible(!!detail.isVisible);
      setTtsPlaying(!!detail.isPlaying);
    };

    window.addEventListener('wip-audio-state-change', handleStateChange);
    return () => {
      window.removeEventListener('wip-audio-state-change', handleStateChange);
    };
  }, []);

  const usingMainPlayer = audioState.isActive;
  const isVisible = usingMainPlayer || ttsVisible;
  const isPlaying = usingMainPlayer ? audioState.isPlaying : ttsPlaying;

  const handleToggle = () => {
    if (usingMainPlayer) {
      if (isPlaying) locationService.pauseGuideAudio();
      else locationService.resumeGuideAudio();
      return;
    }
    if (isPlaying) pauseSpeech();
    else resumeSpeech();
  };

  const handleStop = () => {
    // stopSpeech ferma entrambe le sorgenti (ttsService + player principale).
    stopSpeech();
    setTtsVisible(false);
    setTtsPlaying(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-[88px] left-4 right-4 bg-surface/85 backdrop-blur-2xl border border-outline-variant/60 shadow-2xl rounded-2xl p-3 z-[90] flex items-center justify-between"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-secondary/20 flex items-center justify-center text-secondary shrink-0">
              <Volume2 className={`w-5 h-5 ${isPlaying ? 'animate-pulse' : ''}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-on-surface leading-tight truncate">
                {audioState.poiName || 'Audioguida in riproduzione'}
              </p>
              <p className="text-xs text-on-surface-variant font-medium">
                {isPlaying ? 'In riproduzione' : 'In pausa'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleToggle}
              className="w-10 h-10 rounded-full bg-surface-variant flex items-center justify-center text-on-surface hover:bg-outline-variant transition-colors shadow-sm"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
            </button>

            <button
              onClick={handleStop}
              className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center text-error hover:bg-error/20 transition-colors shadow-sm"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
