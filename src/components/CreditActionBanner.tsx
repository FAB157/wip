import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Coins, X, Check, Zap } from 'lucide-react';
import { getTranslation, linguaCorrente } from '../lib/i18n';

interface CreditActionBannerProps {
  cost: number;
  serviceName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isOpen: boolean;
}

export default function CreditActionBanner({ cost, serviceName, onConfirm, onCancel, isOpen }: CreditActionBannerProps) {
  useEffect(() => {
    if (isOpen) {
      // Auto-dismiss after 5 seconds if not confirmed? Maybe better to keep it for confirmation.
      // But let's add a subtle animation.
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-x-0 top-6 z-[10000] px-4 pointer-events-none flex justify-center">
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="bg-slate-900/95 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-2xl pointer-events-auto flex items-center gap-4 border border-white/10 max-w-sm w-full"
          >
            <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20">
              <Coins className="w-6 h-6 text-slate-900" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-0.5">{getTranslation('vr_b_cb_confirm_service', linguaCorrente())}</p>
              <h4 className="text-sm font-bold truncate leading-tight">
                {getTranslation('vr_b_cb_pre', linguaCorrente())} <span className="text-amber-400">{cost} {getTranslation('credits_word', linguaCorrente())}</span> {getTranslation('vr_b_cb_for', linguaCorrente())} {serviceName}
              </h4>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onCancel}
                className="p-2 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <button
                onClick={onConfirm}
                className="bg-amber-500 text-slate-900 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest shadow-sm hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" /> Ok
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
