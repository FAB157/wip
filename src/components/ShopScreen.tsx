import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ShoppingCart, Coins, ShieldCheck } from 'lucide-react';
import { getWalletBalance, WalletBalance } from '../lib/pricing';
import { notify } from '../lib/toast';
import { getTranslation, type Language } from '../lib/i18n';
import { Capacitor } from '@capacitor/core';
import { Purchases } from '@revenuecat/purchases-capacitor';
import { loadStripe } from '@stripe/stripe-js';
import { getApiUrl } from '../lib/api';
import FreeFeaturesModal from './FreeFeaturesModal';
import { AnimatePresence } from 'motion/react';
import { acquistiInAppDisponibili, leggiPrezziPacchetti, ripristinaAcquisti } from '../services/iapService';

interface ShopScreenProps {
  userId: string;
  language: string;
  onClose: () => void;
}

export default function ShopScreen({ userId, language, onClose }: ShopScreenProps) {
  // La prop arriva maiuscola ('IT') dai più, ma qualche chiamante storico
  // passava 'it' minuscolo: si normalizza per i dizionari i18n.
  const lang = String(language || 'IT').toUpperCase() as Language;
  const t = (key: string) => getTranslation(key, lang);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [isFreeFeaturesOpen, setIsFreeFeaturesOpen] = useState(false);
  // PREZZI VERI dal negozio dell'utente (RevenueCat → App Store / Play Store):
  // già in valuta e formato locali. `null` = non ancora letti, `{}` = offerte
  // non disponibili. In nessuno dei due casi si mostra un prezzo inventato.
  const [prezzi, setPrezzi] = useState<Record<string, string> | null>(null);
  const [ripristinoInCorso, setRipristinoInCorso] = useState(false);
  const iapAttivo = acquistiInAppDisponibili();

  useEffect(() => {
    fetchBalance();
    // Aggiorna il saldo mostrato a ogni consumo/rimborso (evento di pricing.ts)
    const onCreditsUpdated = () => fetchBalance();
    window.addEventListener('wip-credits-updated', onCreditsUpdated);
    return () => window.removeEventListener('wip-credits-updated', onCreditsUpdated);
  }, []);

  // Le offerte si leggono una volta all'apertura dello shop.
  // Sul web (30/08/2026) i prezzi arrivano da /api/shop/pacchetti: e' la stessa
  // tabella che il server mette nel Checkout Stripe, quindi il prezzo mostrato
  // e quello addebitato coincidono per costruzione. Formattati nella lingua
  // dell'utente (la valuta e' quella del listino, l'euro).
  useEffect(() => {
    let vivo = true;
    if (!iapAttivo) {
      const localeDi: Record<string, string> = { IT: 'it-IT', EN: 'en-GB', FR: 'fr-FR', ES: 'es-ES', DE: 'de-DE', RU: 'ru-RU', ZH: 'zh-CN' };
      fetch(`${getApiUrl()}/api/shop/pacchetti`)
        .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
        .then((d: { currency?: string; pacchetti?: { id: string; cents: number }[] }) => {
          if (!vivo) return;
          const fmt = new Intl.NumberFormat(localeDi[lang] || 'it-IT', { style: 'currency', currency: String(d.currency || 'eur').toUpperCase() });
          const p: Record<string, string> = {};
          for (const x of d.pacchetti || []) p[x.id] = fmt.format(x.cents / 100);
          setPrezzi(p);
        })
        .catch(() => { if (vivo) setPrezzi({}); });
      return () => { vivo = false; };
    }
    leggiPrezziPacchetti().then(p => { if (vivo) setPrezzi(p); }).catch(() => { if (vivo) setPrezzi({}); });
    return () => { vivo = false; };
  }, [iapAttivo]);

  /**
   * L'etichetta del pulsante d'acquisto.
   * - Nativo con offerte: il `priceString` dello store (unica verità).
   * - Nativo senza offerte: nessun prezzo e acquisto disabilitato.
   * - Web: il prezzo autorevole lo mostra Stripe Checkout un attimo dopo;
   *   qui si dichiara che il prezzo si vede al pagamento invece di cablare
   *   un euro che potrebbe non essere la valuta dell'utente.
   */
  const prezzoPacchetto = (priceId: string): string | null => {
    if (!prezzi) return null; // ancora in caricamento
    const alias = priceId === 'package_500' ? ['package_500', 'crediti_500'] : [priceId];
    for (const k of alias) { if (prezzi[k]) return prezzi[k]; }
    // Web senza listino raggiungibile: il prezzo autorevole lo mostra comunque
    // Stripe Checkout un attimo dopo, quindi l'acquisto resta possibile.
    return iapAttivo ? null : t('iap_prezzo_al_checkout');
  };
  /** Acquisto possibile solo se sappiamo davvero quanto costa. */
  const acquistoAbilitato = (priceId: string): boolean => !iapAttivo || !!prezzoPacchetto(priceId);

  const handleRipristina = async () => {
    setRipristinoInCorso(true);
    try {
      const esito = await ripristinaAcquisti(userId, lang);
      notify(esito.messaggio, esito.ok ? (esito.ripristinati > 0 ? 'success' : 'info') : 'error');
      await fetchBalance();
    } finally {
      setRipristinoInCorso(false);
    }
  };

  const fetchBalance = async () => {
    const bal = await getWalletBalance(userId);
    setBalance(bal);
  };

  const buyPackage = async (amount: number, bonus: number = 0, priceId: string = 'price_test') => {
    // Senza un account vero i webhook accrediterebbero i crediti al profilo
    // condiviso "mock-user-id" (o a nessuno): soldi veri persi. Meglio
    // chiedere il login prima di incassare.
    if (!userId || userId === 'mock-user-id') {
      notify(t('vr_b_shop_login_before_buy'));
      // Ospite: si apre il login invece di lasciare l'utente col solo toast.
      try { window.dispatchEvent(new CustomEvent('wip-open-login')); } catch { /* SSR */ }
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
          notify(t('vr_b_shop_no_packages'));
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
          notify(t('vr_b_shop_product_not_found').replace('{id}', priceId));
          setLoading(false);
          return;
        }

        await Purchases.purchasePackage({ aPackage: pkgToBuy });
        
        notify(t('vr_b_shop_purchase_ok'));
        
        // Polling leggero per aggiornare la UI quando il webhook accreditato i crediti
        setTimeout(() => fetchBalance(), 3000);
        setTimeout(() => fetchBalance(), 6000);

      } catch (e: any) {
        if (!e.userCancelled) {
          console.error('RevenueCat Error:', e);
          notify(t('vr_b_shop_purchase_err') + e.message);
        }
      } finally {
        setLoading(false);
      }
    } else {
      // 🌐 Solo WEB/PWA: STRIPE CHECKOUT (su nativo, iOS incluso, si passa dal ramo RevenueCat sopra)
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
        notify(t('vr_b_shop_stripe_err'));
      }
    }
  };

  // Il riscatto dei voucher delle strutture partner e' stato TOLTO dallo shop
  // (30/08/2026, richiesta del committente in vista della pubblicazione iOS):
  // e' una funzione B2B, che nel negozio dell'app finale non ha destinatari e
  // che Apple guarda male sotto la 3.1.1 (sblocchi che non passano dagli
  // acquisti in-app). La rotta /api/coupon/redeem resta viva sul server: la
  // usa il pannello delle strutture, non l'app.

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
            <h2 className="text-2xl font-black mb-1">{t('vr_b_shop_recharge_title')}</h2>
            <p className="text-amber-100 text-sm mb-2">
              {t('vr_b_shop_recharge_sub')}
            </p>
            <button 
              onClick={() => setIsFreeFeaturesOpen(true)}
              className="text-xs font-bold text-white/90 underline underline-offset-2 hover:text-white"
            >
              {t('vr_b_shop_free_q')}
            </button>
          </div>
          <Coins className="absolute -right-4 -bottom-4 w-32 h-32 text-white/20" />
        </div>

        <h3 className="font-bold text-slate-500 uppercase text-xs mb-2 ml-1 tracking-wider">
          {t('vr_b_shop_packs')}
        </h3>

        <div className="flex flex-col gap-3">
          <motion.div whileTap={{ scale: 0.98 }} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h4 className="font-black text-lg text-slate-800 leading-tight">City-Break</h4>
              <p className="text-xs text-slate-400 mb-1.5">{t('vr_b_shop_citybreak_sub')}</p>
              <p className="text-slate-600 text-sm flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-500" />
                <span className="font-bold">500 {t('vr_b_credits_cap')}</span>
              </p>
            </div>
            <button onClick={() => buyPackage(500, 0, 'package_500')} disabled={loading || !acquistoAbilitato('package_500')} className="shrink-0 bg-white text-[#1e3a8a] font-black px-5 py-2.5 rounded-xl border-2 border-[#1e3a8a]/20 hover:border-[#1e3a8a]/50 active:scale-95 transition disabled:opacity-50">
              {prezzoPacchetto('package_500') || t('iap_prezzo_non_disp')}
            </button>
          </motion.div>

          <motion.div whileTap={{ scale: 0.98 }} className="bg-gradient-to-br from-[#1e3a8a] to-blue-700 p-4 rounded-xl shadow-lg shadow-blue-900/25 flex items-center justify-between gap-3 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-amber-400 text-blue-950 text-[10px] font-black px-2.5 py-1 rounded-bl-xl tracking-wide">
              +10% BONUS
            </div>
            <Coins className="absolute -right-5 -bottom-6 w-24 h-24 text-white/10 pointer-events-none" />
            <div className="relative min-w-0">
              <h4 className="font-black text-lg text-white leading-tight">{t('vr_b_shop_week_title')}</h4>
              <p className="text-xs text-blue-200 mb-1.5">{t('vr_b_shop_week_sub')}</p>
              <div className="text-blue-100 text-sm flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-400" />
                <span className="line-through opacity-60 text-xs">1000</span>
                <span className="font-black text-white">1100 {t('vr_b_credits_cap')}</span>
              </div>
            </div>
            <button onClick={() => buyPackage(1000, 100, 'package_1100')} disabled={loading || !acquistoAbilitato('package_1100')} className="relative shrink-0 bg-white text-[#1e3a8a] font-black px-5 py-2.5 rounded-xl shadow-md active:scale-95 transition disabled:opacity-50">
              {prezzoPacchetto('package_1100') || t('iap_prezzo_non_disp')}
            </button>
          </motion.div>

          <motion.div whileTap={{ scale: 0.98 }} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between gap-3 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-amber-500 text-white text-[10px] font-black px-2.5 py-1 rounded-bl-xl tracking-wide">
              +30% BONUS
            </div>
            <div className="min-w-0">
              <h4 className="font-black text-lg text-slate-800 leading-tight">Tour Operator</h4>
              <p className="text-xs text-slate-400 mb-1.5">{t('vr_b_shop_tour_sub')}</p>
              <div className="text-slate-600 text-sm flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-500" />
                <span className="line-through opacity-50 text-xs">2000</span>
                {/* Allineato al prodotto reale su Google Play/RevenueCat: package_2600 */}
                <span className="font-black text-amber-600">2600 {t('vr_b_credits_cap')}</span>
              </div>
            </div>
            <button onClick={() => buyPackage(2000, 600, 'package_2600')} disabled={loading || !acquistoAbilitato('package_2600')} className="shrink-0 bg-white text-[#1e3a8a] font-black px-5 py-2.5 rounded-xl border-2 border-[#1e3a8a]/20 hover:border-[#1e3a8a]/50 active:scale-95 transition disabled:opacity-50">
              {prezzoPacchetto('package_2600') || t('iap_prezzo_non_disp')}
            </button>
          </motion.div>
        </div>

        {/* Offerte dello store non raggiungibili: nessun prezzo inventato, si
            spiega perché i pulsanti sono spenti (stessa regola delle foto:
            meglio niente che una cosa sbagliata). */}
        {iapAttivo && prezzi && Object.keys(prezzi).length === 0 && (
          <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
            {t('iap_store_non_raggiungibile')}
          </p>
        )}

        {/* RIPRISTINA ACQUISTI — obbligatorio per App Store Review e gradito da
            Google Play. Sul web non c'è nulla da ripristinare (Stripe accredita
            i crediti al profilo): il pulsante non si mostra. */}
        {iapAttivo && (
          <button
            onClick={handleRipristina}
            disabled={ripristinoInCorso}
            className="mt-4 w-full px-5 py-3 rounded-xl border-2 border-[#1e3a8a]/20 text-[#1e3a8a] font-black text-sm hover:border-[#1e3a8a]/50 active:scale-[0.99] transition disabled:opacity-50"
          >
            {ripristinoInCorso ? t('iap_ripristino_corso') : t('iap_ripristina')}
          </button>
        )}

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4" /> {t('vr_b_shop_secure')}
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
