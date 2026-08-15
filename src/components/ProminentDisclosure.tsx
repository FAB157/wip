import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, ShieldCheck, Info, CheckCircle } from 'lucide-react';
import { Language, getTranslation } from '../lib/i18n';

interface ProminentDisclosureProps {
  isOpen: boolean;
  onAccept: () => void;
  onDecline: () => void;
  language: Language;
}

/**
 * 📢 Prominent Disclosure: Informativa obbligatoria per Google Play riguardante
 * la raccolta della posizione in background.
 */
export default function ProminentDisclosure({ isOpen, onAccept, onDecline, language }: ProminentDisclosureProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md flex items-center justify-center p-6">
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl relative overflow-hidden"
      >
        <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto mb-6 text-blue-600">
           <MapPin className="w-10 h-10 animate-bounce" />
        </div>

        <h2 className="text-2xl font-black text-primary text-center mb-4 leading-tight">
          {language === 'IT' ? 'La tua posizione è preziosa' : 'Your position matters'}
        </h2>

        <div className="space-y-4 mb-8">
           <p className="text-sm font-bold text-gray-600 text-center leading-relaxed">
             {language === 'IT'
               ? 'WIP raccoglie i dati sulla tua posizione per abilitare il commento audio automatico dei monumenti anche quando l\'app è chiusa o non in uso.'
               : 'WIP collects location data to enable automatic audio commentary of monuments even when the app is closed or not in use.'
             }
           </p>

           <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
              <ul className="space-y-3">
                 <li className="flex items-start gap-3 text-xs font-bold text-blue-900/70">
                    <CheckCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <span>{language === 'IT' ? 'Audioguida automatica mentre cammini' : 'Automatic audio guide while walking'}</span>
                 </li>
                 <li className="flex items-start gap-3 text-xs font-bold text-blue-900/70">
                    <CheckCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <span>{language === 'IT' ? 'Funziona a schermo spento' : 'Works with screen off'}</span>
                 </li>
                 <li className="flex items-start gap-3 text-xs font-bold text-blue-900/70">
                    <CheckCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <span>{language === 'IT' ? 'Dati protetti e non condivisi' : 'Protected data, not shared'}</span>
                 </li>
              </ul>
           </div>

           <p className="text-[10px] text-gray-500 font-bold text-center">
             {language === 'IT'
               ? 'Puoi disattivare questa funzione in qualsiasi momento dalle impostazioni.'
               : 'You can disable this feature at any time from the settings.'
             }
           </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={onAccept}
            className="w-full py-4 bg-primary text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-lg active:scale-95"
          >
            {language === 'IT' ? 'ACCETTA E CONTINUA' : 'ACCEPT AND CONTINUE'}
          </button>
          <button
            onClick={onDecline}
            className="w-full py-3 text-gray-500 font-black text-xs uppercase tracking-widest hover:text-gray-600 transition-colors"
          >
            {language === 'IT' ? 'Non ora' : 'Not now'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
