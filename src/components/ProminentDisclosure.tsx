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
  const t = (key: string) => getTranslation(key, language);
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
          {t('vr_b_pd_title')}
        </h2>

        <div className="space-y-4 mb-8">
           <p className="text-sm font-bold text-gray-600 text-center leading-relaxed">
             {t('vr_b_pd_body')}
           </p>

           <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
              <ul className="space-y-3">
                 <li className="flex items-start gap-3 text-xs font-bold text-blue-900/70">
                    <CheckCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <span>{t('vr_b_pd_b1')}</span>
                 </li>
                 <li className="flex items-start gap-3 text-xs font-bold text-blue-900/70">
                    <CheckCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <span>{t('vr_b_pd_b2')}</span>
                 </li>
                 <li className="flex items-start gap-3 text-xs font-bold text-blue-900/70">
                    <CheckCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <span>{t('vr_b_pd_b3')}</span>
                 </li>
              </ul>
           </div>

           <p className="text-[12px] text-gray-600 font-bold text-center">
             {t('vr_b_pd_note')}
           </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onAccept}
            className="w-full min-h-11 py-4 bg-primary text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-lg active:scale-95"
          >
            {t('vr_b_pd_accept')}
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="w-full min-h-11 py-3 text-gray-600 font-black text-xs uppercase tracking-widest hover:text-gray-700 transition-colors"
          >
            {t('vr_b_pd_decline')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
