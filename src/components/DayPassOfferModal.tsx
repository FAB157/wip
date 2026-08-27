import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles } from 'lucide-react';
import DayPassCard from './DayPassCard';
import { getTranslation, linguaCorrente } from '../lib/i18n';

interface DayPassOfferModalProps {
  isOpen: boolean;
  city: string;
  poisCount: number;
  onClose: () => void;
}

/**
 * Offerta contestuale del Day Pass — sostituisce il vecchio
 * PredictiveBundleModal (sconto bundle regionale 50%). Appare quando l'utente
 * attiva le cuffie in una zona ricca di luoghi (vedi usePredictiveDownload),
 * al massimo una volta ogni 24 ore.
 */
export default function DayPassOfferModal({ isOpen, city, poisCount, onClose }: DayPassOfferModalProps) {
  const tr = (k: string) => getTranslation(k, linguaCorrente());
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="bg-white rounded-3xl w-full max-w-md p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-700" />
                <h2 className="text-lg font-black text-gray-900 font-display">
                  {poisCount > 0
                    ? tr('gr_dp_offer_luoghi').replace('{n}', String(poisCount)).replace('{city}', city)
                    : tr('gr_dp_offer_scopri').replace('{city}', city)}
                </h2>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 shrink-0" aria-label={tr('gr_chiudi')}>
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              {tr('gr_dp_offer_testo')}
            </p>
            <DayPassCard />
            <button
              onClick={onClose}
              className="w-full text-center text-sm text-gray-500 mt-3 py-1 hover:text-gray-600"
            >
              {tr('gr_non_ora')}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
