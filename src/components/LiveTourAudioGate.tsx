import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Volume2, X } from 'lucide-react';
import { riascoltaDalLeader } from '../hooks/useLiveTour';
import { getTranslation } from '../lib/i18n';

/**
 * TOUR DI GRUPPO — il salvagente del follower (09/09/2026).
 *
 * Il leader sblocca un luogo e l'audio dovrebbe partire da solo sul telefono
 * di tutti. Quando non parte — il browser rifiuta una riproduzione senza
 * gesto dell'utente, l'audioguida è in muto, il TTS non risponde — prima non
 * succedeva NULLA e il follower restava zitto senza capire perché.
 * Qui compare un pulsante grosso: un tocco (che è il gesto che serviva) e la
 * voce parte dall'altoparlante.
 */
export default function LiveTourAudioGate({ language }: { language: any }) {
  const [stato, setStato] = useState<{ poiName?: string; motivo?: string } | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const t = (k: string) => getTranslation(k, language);

  useEffect(() => {
    const onGate = (e: any) => {
      const d = e?.detail || {};
      if (d.chiudi) { setStato(null); return; }
      setStato({ poiName: d.poiName, motivo: d.motivo });
    };
    // Fine del tour: via il pulsante, non c'è più niente da riascoltare.
    const onEnded = () => setStato(null);
    window.addEventListener('wip-live-audio-gate', onGate);
    window.addEventListener('wip-live-tour-ended', onEnded);
    return () => {
      window.removeEventListener('wip-live-audio-gate', onGate);
      window.removeEventListener('wip-live-tour-ended', onEnded);
    };
  }, []);

  const ascolta = async () => {
    if (inCorso) return;
    setInCorso(true);
    try {
      const ok = await riascoltaDalLeader();
      if (ok) setStato(null);
    } finally {
      setInCorso(false);
    }
  };

  return (
    <AnimatePresence>
      {stato && (
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          className="fixed bottom-24 left-4 right-4 z-[1200] print:hidden"
          role="status"
          aria-live="polite"
        >
          <div className="bg-blue-600 text-white rounded-3xl shadow-xl shadow-blue-900/30 p-4 flex items-center gap-3">
            <button
              onClick={ascolta}
              disabled={inCorso}
              className="flex-1 flex items-center gap-3 text-left disabled:opacity-60"
            >
              <span className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                <Volume2 className="w-6 h-6" />
              </span>
              <span className="min-w-0">
                <span className="block font-black text-sm truncate">
                  {t(stato.motivo === 'muto' ? 'vr_a_lt_gate_muto' : 'vr_a_lt_gate_bloccato')}
                </span>
                <span className="block text-[11px] font-bold opacity-90 truncate">
                  {stato.poiName
                    ? `${t('vr_a_lt_gate_tocca')} — ${stato.poiName}`
                    : t('vr_a_lt_gate_tocca')}
                </span>
              </span>
            </button>
            <button
              onClick={() => setStato(null)}
              aria-label={t('sk_chiudi')}
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
