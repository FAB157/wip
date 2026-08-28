import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, X, Volume2 } from 'lucide-react';
import { locationService } from '../services/locationService';
import { pauseSpeech, resumeSpeech, stopSpeech } from '../services/ttsService';
import { useAudioState } from '../hooks/useAudioState';
import { getTranslation, linguaCorrente } from '../lib/i18n';

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

  // Montato senza `language` in App.tsx: la lingua è quella scritta in
  // localStorage a ogni cambio (stessa fonte di TourRouteLayer).
  const language = linguaCorrente();
  const t = (key: string) => getTranslation(key, language);

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

  // bottom con safe-area (UX-12): `88px` fissi finivano sotto la gesture bar
  // su iPhone. 5,5 rem = barra tab (4 rem) + 1,5 rem d'aria.
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          role="region"
          aria-label={t('audio_titolo_default')}
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] left-4 right-4 bg-surface/85 backdrop-blur-2xl border border-outline-variant/60 shadow-2xl rounded-2xl p-3 z-[90] flex items-center justify-between"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-secondary/20 flex items-center justify-center text-secondary shrink-0" aria-hidden="true">
              <Volume2 className={`w-5 h-5 ${isPlaying ? 'animate-pulse' : ''}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-on-surface leading-tight truncate">
                {audioState.poiName || t('audio_titolo_default')}
              </p>
              <p className="text-xs text-on-surface-variant font-medium" aria-live="polite">
                {isPlaying ? t('audio_in_riproduzione') : t('audio_in_pausa')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleToggle}
              aria-label={isPlaying ? t('a11y_pausa') : t('a11y_riproduci')}
              className="min-w-11 min-h-11 rounded-full bg-surface-variant flex items-center justify-center text-on-surface hover:bg-outline-variant transition-colors shadow-sm"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
            </button>

            <button
              type="button"
              onClick={handleStop}
              aria-label={t('a11y_ferma_audio')}
              className="min-w-11 min-h-11 rounded-full bg-error/10 flex items-center justify-center text-error hover:bg-error/20 transition-colors shadow-sm"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
