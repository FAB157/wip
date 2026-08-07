import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles } from 'lucide-react';
import DayPassCard from './DayPassCard';

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
                  {poisCount > 0 ? `${poisCount}+ luoghi da scoprire a ${city}` : `Scopri ${city} a mani libere`}
                </h2>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 shrink-0" aria-label="Chiudi">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Attiva il Day Pass e per 24 ore WIP fa tutto da solo: avviso, teaser e audioguida
              completa quando ti avvicini a un luogo — anche in tasca, a schermo spento e senza rete.
            </p>
            <DayPassCard />
            <button
              onClick={onClose}
              className="w-full text-center text-sm text-gray-400 mt-3 py-1 hover:text-gray-600"
            >
              Non ora
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
