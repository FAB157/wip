import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Coins, X, Check, ShoppingCart, AlertCircle } from 'lucide-react';
import { getTranslation } from '../lib/i18n';

interface CreditConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onBuyCredits: () => void;
  cost: number;
  currentBalance: number;
  serviceName: string;
  language: string;
}

export default function CreditConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  onBuyCredits,
  cost,
  currentBalance,
  serviceName,
  language
}: CreditConfirmationModalProps) {
  const hasEnough = currentBalance >= cost;
  const isItalian = language === 'IT';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-x-0 top-6 z-[10000] px-4 pointer-events-none flex justify-center">
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`pointer-events-auto w-full max-w-sm shadow-2xl rounded-2xl overflow-hidden border ${
              hasEnough ? 'bg-slate-900 border-white/10' : 'bg-red-900 border-red-500/20'
            }`}
          >
            <div className="p-4 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-lg ${
                hasEnough ? 'bg-amber-500 shadow-amber-500/20' : 'bg-white/10'
              }`}>
                {hasEnough ? (
                  <Coins className="w-7 h-7 text-slate-900" />
                ) : (
                  <AlertCircle className="w-7 h-7 text-white" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className={`text-[10px] font-black uppercase tracking-widest mb-0.5 ${
                  hasEnough ? 'text-amber-500' : 'text-red-400'
                }`}>
                  {hasEnough ? (isItalian ? 'Conferma Servizio' : 'Confirm Service') : (isItalian ? 'Crediti Insufficienti' : 'Low Credits')}
                </p>
                <h4 className="text-sm font-bold text-white leading-tight truncate">
                  {cost > 0 ? (
                    <>Stai usando <span className="text-amber-400">{cost} crediti</span> per {serviceName}</>
                  ) : (
                    <>{isItalian ? 'Stai attivando' : 'You are activating'} <span className="text-amber-400">{serviceName}</span></>
                  )}
                </h4>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] font-bold text-white/50">Saldo attuale:</span>
                  <span className={`text-[10px] font-black ${hasEnough ? 'text-emerald-400' : 'text-red-300'}`}>
                    🪙 {currentBalance}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0 ml-2">
                <button
                  onClick={onClose}
                  className="p-2 text-white/40 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Action Area */}
            <div className="px-4 pb-4 flex gap-2">
              {hasEnough ? (
                <>
                  <button
                    onClick={onClose}
                    className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition-all"
                  >
                    {isItalian ? 'Annulla' : 'Cancel'}
                  </button>
                  <button
                    onClick={onConfirm}
                    className="flex-[2] py-2.5 bg-amber-500 text-slate-900 font-black text-[10px] uppercase tracking-widest rounded-xl shadow-lg hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" /> {isItalian ? 'Conferma' : 'Confirm'}
                  </button>
                </>
              ) : (
                <button
                  onClick={onBuyCredits}
                  className="w-full py-3 bg-white text-red-900 font-black text-[11px] uppercase tracking-widest rounded-xl shadow-lg hover:bg-gray-100 transition-all flex items-center justify-center gap-2"
                >
                  <ShoppingCart className="w-4 h-4" /> {isItalian ? 'Ricarica Crediti' : 'Buy Credits'}
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
