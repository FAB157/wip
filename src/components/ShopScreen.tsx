import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ShoppingCart, Coins, ShieldCheck, Ticket } from 'lucide-react';
import { getWalletBalance, WalletBalance } from '../lib/pricing';
import { supabase } from '../lib/supabase';
import { notify } from '../lib/toast';
import { getTranslation } from '../lib/i18n';
import { Capacitor } from '@capacitor/core';
import { Purchases } from '@revenuecat/purchases-capacitor';
import { loadStripe } from '@stripe/stripe-js';
import { getApiUrl } from '../lib/api';
import FreeFeaturesModal from './FreeFeaturesModal';
import { AnimatePresence } from 'motion/react';

interface ShopScreenProps {
  userId: string;
  language: string;
  onClose: () => void;
}

export default function ShopScreen({ userId, language, onClose }: ShopScreenProps) {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [voucherCode, setVoucherCode] = useState('');
  const [isFreeFeaturesOpen, setIsFreeFeaturesOpen] = useState(false);

  useEffect(() => {
    fetchBalance();
    // Aggiorna il saldo mostrato a ogni consumo/rimborso (evento di pricing.ts)
    const onCreditsUpdated = () => fetchBalance();
    window.addEventListener('wip-credits-updated', onCreditsUpdated);
    return () => window.removeEventListener('wip-credits-updated', onCreditsUpdated);
  }, []);

  const fetchBalance = async () => {
    const bal = await getWalletBalance(userId);
    setBalance(bal);
  };

  const buyPackage = async (amount: number, bonus: number = 0, priceId: string = 'price_test') => {
    // Senza un account vero i webhook accrediterebbero i crediti al profilo
    // condiviso "mock-user-id" (o a nessuno): soldi veri persi. Meglio
    // chiedere il login prima di incassare.
    if (!userId || userId === 'mock-user-id') {
      notify(language === 'EN'
        ? 'Please sign in to your account before purchasing credits.'
        : 'Accedi al tuo account prima di acquistare crediti.');
      return;
    }
    setLoading(true);
    const totalCredits = amount + bonus;

    if (Capacitor.isNativePlatform()) {
      // 📱 ANDROID/iOS: BILLING DELLO STORE (Google Play / App Store via RevenueCat)
      try {
        // Collega l'ID utente di Supabase a RevenueCat per il Webhook
        await Purchases.logIn({ appUserID: userId });

        const offerings = await Purchases.getOfferings();
        if (!offerings.current) {
          notify("Nessun pacchetto disponibile al momento. Riprova più tardi.");
          setLoading(false);
          return;
        }

        // Cerca il pacchetto per identifier RevenueCat O per product id dello
        // store: nella dashboard il pacchetto piccolo ha identifier
        // "crediti_500" (product package_500), quindi il solo confronto
        // sull'identifier non lo trovava mai.
        const wanted = priceId === 'package_500' ? ['package_500', 'crediti_500'] : [priceId];
        const pkgToBuy = offerings.current.availablePackages.find(p =>
          wanted.includes(p.identifier) ||
          wanted.includes(String((p as any).product?.identifier || '').split(':')[0])
        );
        
        if (!pkgToBuy) {
          notify(`Prodotto ${priceId} non trovato nello store. Configurazione Google Play mancante?`);
          setLoading(false);
          return;
        }

        await Purchases.purchasePackage({ aPackage: pkgToBuy });
        
        notify("Acquisto completato con successo! I crediti verranno aggiornati a breve.");
        
        // Polling leggero per aggiornare la UI quando il webhook accreditato i crediti
        setTimeout(() => fetchBalance(), 3000);
        setTimeout(() => fetchBalance(), 6000);

      } catch (e: any) {
        if (!e.userCancelled) {
          console.error('RevenueCat Error:', e);
          notify("Errore durante l'acquisto: " + e.message);
        }
      } finally {
        setLoading(false);
      }
    } else {
      // 🌐 WEB / iOS: STRIPE CHECKOUT
      try {
        // getApiUrl: su app nativa l'URL relativo non raggiunge il server
        // (origin file:// / capacitor://) — il checkout non partiva mai da iOS.
        const res = await fetch(getApiUrl('/api/stripe/create-checkout'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, amount: totalCredits, priceId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Creazione sessione fallita');

        if (data.url) {
           // Redirect diretto all'URL della sessione: non richiede la chiave
           // pubblica Stripe.js (VITE_STRIPE_PUBLIC_KEY spesso assente).
           window.location.href = data.url;
        } else if (data.sessionId) {
           const stripe = await loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || 'pk_test_placeholder');
           // Attesa + errore esplicito: il redirect non atteso lasciava
           // `loading` a true per sempre (tutti i bottoni d'acquisto morti)
           // quando la chiave era un placeholder o il popup veniva bloccato.
           const result = await (stripe as any)?.redirectToCheckout({ sessionId: data.sessionId });
           if (result?.error) throw new Error(result.error.message || 'Redirect Stripe fallito');
        } else {
           throw new Error("Nessuna sessione restituita");
        }
      } catch (e) {
        console.error('Stripe Error:', e);
        setLoading(false);
        notify("Errore durante la creazione del pagamento Stripe.");
      }
    }
  };

  const redeemVoucher = async () => {
    const code = voucherCode.trim().toUpperCase();
    if (!code) return;
    setLoading(true);

    try {
      // Riscatto SERVER-SIDE: valida, consuma il coupon e accredita i crediti
      // con la service key. Il vecchio percorso client scriveva earned_credits
      // direttamente — bloccato dalle policy di sicurezza → riscatto a vuoto.
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        notify('Accedi al tuo account per riscattare il voucher.');
        return;
      }
      const res = await fetch(getApiUrl('/api/coupon/redeem'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Riscatto non riuscito.');

      notify(`Voucher${data.structureName ? ` ${data.structureName}` : ''} riscattato! Hai ricevuto ${data.credits} crediti omaggio.`);
      setVoucherCode('');
      await fetchBalance();
    } catch (e: any) {
      console.error(e);
      notify(e?.message || "Errore durante il riscatto del voucher.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800">
      <div className="bg-white p-4 shadow-sm z-10 flex items-center gap-3">
        <button onClick={onClose} className="p-2 -ml-2 text-slate-400 hover:text-slate-800 rounded-full hover:bg-slate-100">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </button>
        <h1 className="text-xl font-black text-slate-800 flex-1">
          WIP Shop
        </h1>
        {balance && (
          <div className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full font-bold flex items-center gap-1">
            <Coins className="w-4 h-4" /> {balance.total}
          </div>
        )}
      </div>

      {/* pb con safe-area: su Android con gesture bar il fondo del contenitore
          resta coperto dalla barra di sistema — senza questo margine extra
          l'ultimo pacchetto non era raggiungibile con lo scroll. min-h-0
          garantisce che il figlio flex possa restringersi e quindi scrollare. */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 pb-[calc(9rem+env(safe-area-inset-bottom))]">
        <div className="mb-6 bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-2xl font-black mb-1">Ricarica il tuo viaggio</h2>
            <p className="text-amber-100 text-sm mb-2">
              I crediti ti permettono di sbloccare audioguide, generare itinerari su misura e scansionare monumenti con l'AI.
            </p>
            <button 
              onClick={() => setIsFreeFeaturesOpen(true)}
              className="text-xs font-bold text-white/90 underline underline-offset-2 hover:text-white"
            >
              Cosa posso fare gratis invece?
            </button>
          </div>
          <Coins className="absolute -right-4 -bottom-4 w-32 h-32 text-white/20" />
        </div>

        <h3 className="font-bold text-slate-500 uppercase text-xs mb-3 ml-1 tracking-wider">
          Riscatta Voucher Hotel
        </h3>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 mb-8 overflow-hidden">
          <div className="flex items-center gap-3 p-4 pb-3">
            <div className="w-11 h-11 rounded-xl bg-[#1e3a8a]/10 flex items-center justify-center shrink-0">
              <Ticket className="w-5 h-5 text-[#1e3a8a]" />
            </div>
            <div className="min-w-0">
              <h4 className="font-black text-slate-800 leading-tight">Ospite di una struttura partner?</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Inserisci il codice ricevuto dal tuo hotel: i crediti omaggio arrivano subito sul tuo saldo.
              </p>
            </div>
          </div>
          <div className="px-4 pb-4 flex gap-2">
            <input
              type="text"
              placeholder="Inserisci codice voucher"
              className="flex-1 min-w-0 px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#1e3a8a] focus:bg-white transition-colors font-bold uppercase tracking-widest text-slate-800 placeholder:normal-case placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400"
              value={voucherCode}
              onChange={(e) => setVoucherCode(e.target.value)}
            />
            <button
              onClick={redeemVoucher}
              disabled={loading || !voucherCode.trim()}
              className="shrink-0 bg-[#1e3a8a] text-white font-bold px-5 py-3 rounded-xl hover:bg-blue-900 active:scale-95 transition disabled:opacity-40"
            >
              Riscatta
            </button>
          </div>
        </div>

        <h3 className="font-bold text-slate-500 uppercase text-xs mb-3 ml-1 tracking-wider">
          Pacchetti Crediti
        </h3>
        
        <div className="flex flex-col gap-4">
          <motion.div whileTap={{ scale: 0.98 }} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h4 className="font-black text-lg text-slate-800 leading-tight">City-Break</h4>
              <p className="text-xs text-slate-400 mb-1.5">Perfetto per un weekend in città</p>
              <p className="text-slate-600 text-sm flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-500" />
                <span className="font-bold">500 Crediti</span>
              </p>
            </div>
            <button onClick={() => buyPackage(500, 0, 'package_500')} disabled={loading} className="shrink-0 bg-white text-[#1e3a8a] font-black px-5 py-2.5 rounded-xl border-2 border-[#1e3a8a]/20 hover:border-[#1e3a8a]/50 active:scale-95 transition disabled:opacity-50">
              € 4,99
            </button>
          </motion.div>

          <motion.div whileTap={{ scale: 0.98 }} className="bg-gradient-to-br from-[#1e3a8a] to-blue-700 p-5 rounded-2xl shadow-lg shadow-blue-900/25 flex items-center justify-between gap-3 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-amber-400 text-blue-950 text-[10px] font-black px-2.5 py-1 rounded-bl-xl tracking-wide">
              +10% BONUS
            </div>
            <Coins className="absolute -right-5 -bottom-6 w-24 h-24 text-white/10 pointer-events-none" />
            <div className="relative min-w-0">
              <h4 className="font-black text-lg text-white leading-tight">Vacanza 1 Settimana</h4>
              <p className="text-xs text-blue-200 mb-1.5">Il più scelto dai viaggiatori</p>
              <div className="text-blue-100 text-sm flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-400" />
                <span className="line-through opacity-60 text-xs">1000</span>
                <span className="font-black text-white">1100 Crediti</span>
              </div>
            </div>
            <button onClick={() => buyPackage(1000, 100, 'package_1100')} disabled={loading} className="relative shrink-0 bg-white text-[#1e3a8a] font-black px-5 py-2.5 rounded-xl shadow-md active:scale-95 transition disabled:opacity-50">
              € 9,99
            </button>
          </motion.div>

          <motion.div whileTap={{ scale: 0.98 }} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between gap-3 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-amber-500 text-white text-[10px] font-black px-2.5 py-1 rounded-bl-xl tracking-wide">
              +30% BONUS
            </div>
            <div className="min-w-0">
              <h4 className="font-black text-lg text-slate-800 leading-tight">Tour Operator</h4>
              <p className="text-xs text-slate-400 mb-1.5">Il massimo risparmio per lunghi viaggi</p>
              <div className="text-slate-600 text-sm flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-500" />
                <span className="line-through opacity-50 text-xs">2000</span>
                {/* Allineato al prodotto reale su Google Play/RevenueCat: package_2600 */}
                <span className="font-black text-amber-600">2600 Crediti</span>
              </div>
            </div>
            <button onClick={() => buyPackage(2000, 600, 'package_2600')} disabled={loading} className="shrink-0 bg-white text-[#1e3a8a] font-black px-5 py-2.5 rounded-xl border-2 border-[#1e3a8a]/20 hover:border-[#1e3a8a]/50 active:scale-95 transition disabled:opacity-50">
              € 19,99
            </button>
          </motion.div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4" /> Pagamenti sicuri criptati
        </div>
      </div>
      
      <AnimatePresence>
        {isFreeFeaturesOpen && (
          <FreeFeaturesModal onClose={() => setIsFreeFeaturesOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
