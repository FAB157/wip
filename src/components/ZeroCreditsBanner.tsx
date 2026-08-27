import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, ShoppingCart, X } from 'lucide-react';
import { getWalletBalance, WalletBalance } from '../lib/pricing';
import { supabase } from '../lib/supabase';
import { getTranslation, linguaCorrente } from '../lib/i18n';
import ShopScreen from './ShopScreen';
import FreeFeaturesModal from './FreeFeaturesModal';

interface ZeroCreditsBannerProps {
  userId: string;
}

export default function ZeroCreditsBanner({ userId }: ZeroCreditsBannerProps) {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [isFreeFeaturesOpen, setIsFreeFeaturesOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const fetchBalance = async () => {
      const bal = await getWalletBalance(userId);
      setBalance(bal);
    };

    fetchBalance();

    // Listen for changes on the user_profiles table for this user
    const channel = supabase.channel('zero_credits_check')
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'user_profiles',
        filter: `id=eq.${userId}` 
      }, () => {
        fetchBalance();
      })
      .subscribe();

    // La realtime subscription richiede che user_profiles sia nella publication
    // supabase_realtime (non garantito): l'evento locale di pricing.ts copre
    // comunque i consumi fatti da questo client.
    const onCreditsUpdated = () => fetchBalance();
    window.addEventListener('wip-credits-updated', onCreditsUpdated);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('wip-credits-updated', onCreditsUpdated);
    };
  }, [userId]);

  if (!balance || balance.total > 0 || isDismissed) return null;

  // Banner montato fuori dall'albero con la prop language: la lingua arriva
  // dalla stessa chiave localStorage che App.tsx aggiorna a ogni cambio.
  const lingua = linguaCorrente();

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-[9999] p-4 pointer-events-none flex justify-center">
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="bg-slate-900 text-white p-3 rounded-2xl shadow-2xl pointer-events-auto flex items-center justify-between gap-3 w-full max-w-sm border-l-4 border-amber-500"
        >
          <div className="flex items-center gap-2">
            <div className="bg-white/10 p-1.5 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wide">{getTranslation('vr_b_zc_title', lingua)}</h3>
              <p className="text-[10px] text-slate-300 font-medium">{getTranslation('vr_b_zc_sub', lingua)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsFreeFeaturesOpen(true)}
              className="text-[10px] underline text-slate-400 hover:text-white"
            >
              {getTranslation('vr_b_zc_free', lingua)}
            </button>
            <button
              onClick={() => setIsShopOpen(true)}
              className="bg-amber-500 text-slate-900 px-3 py-1.5 rounded-lg font-bold text-xs whitespace-nowrap shadow-sm hover:scale-105 active:scale-95 transition-transform flex items-center gap-1"
            >
              <ShoppingCart className="w-3 h-3" /> Shop
            </button>
            <button onClick={() => setIsDismissed(true)} className="p-1 text-slate-400 hover:text-white transition-colors rounded-full hover:bg-white/10">
              <span className="sr-only">{getTranslation('close', lingua)}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {isShopOpen && (
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-[10000] bg-white"
          >
            <ShopScreen
              userId={userId}
              // BUG FIX: la lingua era cablata a "it" — ora è quella vera
              // della UI (stessa chiave localStorage scritta da App.tsx).
              language={lingua}
              onClose={() => setIsShopOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isFreeFeaturesOpen && (
          <FreeFeaturesModal onClose={() => setIsFreeFeaturesOpen(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
