import React, { useState } from 'react';
import { Language, getTranslation } from '../lib/i18n';
import { Zap, Headphones, Map, Camera, Check, Coins, MessageSquare, Info, Volume2, BookOpen, ShoppingCart } from 'lucide-react';
import CreditConfirmationModal from './CreditConfirmationModal';
import { getWalletBalance } from '../lib/pricing';
import { notify } from '../lib/toast';
import { supabase } from '../lib/supabase';
import { useEffect } from 'react';

interface PricingProps {
  userSession?: any;
  language: Language;
}

export default function Pricing({ userSession, language }: PricingProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState<any>(null); // { name, price, priceId, credits }
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    if (userSession?.user?.id) {
      getWalletBalance(userSession.user.id).then(bal => setBalance(bal.total));
    }
  }, [userSession]);

  const packs = [
    {
      id: 'pack_city_break',
      name: 'City-Break',
      credits: 500,
      price: '4,99€',
      priceCents: 499,
      description: 'Perfetto per un weekend intenso alla scoperta di una città.',
      icon: <Zap className="w-6 h-6 text-amber-500" />,
      features: ['500 Crediti', 'Senza scadenza', 'Tutti i servizi inclusi'],
      productId: 'prod_UsVL0BLyvlsUpQ'
    },
    {
      id: 'pack_vacanza',
      name: 'Vacanza 1 Settimana',
      credits: 1100,
      price: '9,99€',
      priceCents: 999,
      popular: true,
      description: 'Ideale per una settimana di esplorazione senza pensieri.',
      icon: <Headphones className="w-6 h-6 text-blue-500" />,
      features: ['1100 Crediti (10% Bonus)', 'Senza scadenza', 'Assistenza prioritaria'],
      productId: 'prod_UsVNo4maZozOjK'
    },
    {
      id: 'pack_tour_operator',
      name: 'Tour Operator',
      credits: 2500,
      price: '19,99€',
      priceCents: 1999,
      description: 'La scelta definitiva per viaggiatori seriali e piccoli gruppi.',
      icon: <Map className="w-6 h-6 text-emerald-500" />,
      features: ['2500 Crediti (25% Bonus)', 'Senza scadenza', 'Accesso a tutte le funzioni Pro'],
      productId: 'prod_UsVOR6EmravnIE'
    }
  ];

  const handleConfirmPurchase = () => {
    if (showConfirm) {
      const { productId, priceCents, credits } = showConfirm;
      setShowConfirm(null);
      executeCheckout(productId, priceCents, credits);
    }
  };

  const executeCheckout = async (productId: string, priceCents: number, credits: number) => {
    if (!userSession || !userSession.user) {
      notify(getTranslation("premium_alert_login", language));
      return;
    }
    
    if ((window as any).Capacitor && (window as any).Capacitor.isNativePlatform()) {
      notify(getTranslation("premium_error", language) + ": Gli acquisti in-app tramite Google Play saranno disponibili a breve. Per ora, visita il nostro sito web per gestire l'abbonamento.");
      return;
    }

    setLoading(productId);
    
    try {
      const { data: edgeData, error } = await supabase.functions.invoke('stripe-checkout', {
        body: {
          productId: productId,
          priceCents: priceCents,
          credits: credits,
          userId: userSession.user.id
        }
      });

      if (error) throw error;
      
      if (edgeData?.sessionId) {
        const stripeModule = await import('@stripe/stripe-js');
        const loadStripe = stripeModule.loadStripe;
        const stripe = await loadStripe('pk_test_51TZDL16ssNLgb6zHYHEMKH3dDjFfnPg8VNKpEvhBo8xy0IqBIR6sCqtDims4ArBQK2FkI9pZGvhvFGZmMhkF7ly900Z0IJZuZV');
        if (stripe) {
          await (stripe as any).redirectToCheckout({ sessionId: edgeData.sessionId });
        }
      }
    } catch (err: any) {
      console.error(err);
      notify('Errore durante l\'apertura del checkout: ' + err.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="py-8 px-4 flex flex-col items-center">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-black text-primary mb-2 uppercase tracking-tight">Ricarica Crediti</h2>
        <p className="text-sm max-w-md text-gray-500 font-medium">
          Scegli il pacchetto più adatto alla tua curiosità. I crediti non scadono mai.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl w-full">
        {packs.map((pack) => (
          <div 
            key={pack.id}
            className={`flex flex-col bg-white rounded-[2.5rem] p-8 relative transition-all duration-300 border-2 ${
              pack.popular ? 'border-primary shadow-xl scale-105 z-10' : 'border-gray-100 shadow-sm hover:border-gray-200'
            }`}
          >
            {pack.popular && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg">
                Consigliato
              </div>
            )}

            <div className="mb-6 flex justify-between items-start">
              <div className="p-3 bg-gray-50 rounded-2xl">
                {pack.icon}
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-primary leading-none">{pack.price}</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Acquisto Singolo</div>
              </div>
            </div>

            <h3 className="text-xl font-black text-gray-900 mb-1">{pack.name}</h3>
            <p className="text-xs text-gray-500 font-bold mb-6">{pack.description}</p>

            <div className="flex-1 space-y-3 mb-8">
              {pack.features.map((feature, i) => (
                <div key={i} className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <div className="w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                    <Check className="w-3 h-3" />
                  </div>
                  {feature}
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                if (!userSession) {
                  notify(getTranslation("premium_alert_login", language));
                  return;
                }
                setShowConfirm(pack);
              }}
              disabled={loading !== null}
              className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 ${
                pack.popular
                  ? 'bg-primary text-white shadow-lg shadow-primary/20 hover:opacity-90'
                  : 'bg-gray-900 text-white hover:bg-gray-800'
              } ${loading === pack.productId ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {loading === pack.productId ? 'Attendere...' : 'Acquista'}
            </button>
          </div>
        ))}
      </div>

      <CreditConfirmationModal
        isOpen={!!showConfirm}
        onClose={() => setShowConfirm(null)}
        onConfirm={handleConfirmPurchase}
        onBuyCredits={() => {}}
        cost={0}
        currentBalance={balance}
        serviceName={showConfirm ? `${showConfirm.name} (${showConfirm.price})` : ""}
        language={language}
      />

      <div className="mt-12 p-8 bg-slate-900 rounded-[2.5rem] max-w-4xl w-full border border-white/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full -mr-20 -mt-20 blur-3xl"></div>

        <div className="flex items-center gap-4 mb-8 relative z-10">
          <div className="w-14 h-14 bg-amber-500 rounded-2xl flex items-center justify-center text-slate-900 shadow-lg shadow-amber-500/20 shrink-0">
            <Coins className="w-8 h-8" />
          </div>
          <div>
            <h4 className="font-black text-white text-xl uppercase tracking-wider">Listino Servizi AI</h4>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Trasparenza totale sui tuoi consumi</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10">
          <ServicePriceItem icon={<MessageSquare className="w-4 h-4" />} name="Wip - Esperto Viaggi" price="3" unit="10 msg" />
          <ServicePriceItem icon={<Info className="w-4 h-4" />} name="Dettagli POI" price="5" unit="per luogo" />
          <ServicePriceItem icon={<Camera className="w-4 h-4" />} name="Vision AI" price="5" unit="per scansione" />
          <ServicePriceItem icon={<Map className="w-4 h-4" />} name="Itinerario AI" price="10" unit="al giorno" />
          <ServicePriceItem icon={<Headphones className="w-4 h-4" />} name="Audioguida" price="15" unit="per luogo" />
          <ServicePriceItem icon={<Volume2 className="w-4 h-4" />} name="Podcast AI" price="15" unit="al giorno" />
          <ServicePriceItem icon={<BookOpen className="w-4 h-4" />} name="Guida PDF" price="20" unit="al giorno" />
        </div>

        <div className="mt-8 pt-6 border-t border-white/5 text-center">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
            I crediti non scadono mai • Utilizzo e Consigli sono sempre gratuiti
          </p>
        </div>
      </div>
    </div>
  );
}

function ServicePriceItem({ icon, name, price, unit }: { icon: React.ReactNode, name: string, price: string, unit?: string }) {
  return (
    <div className="flex flex-col p-4 bg-white/5 rounded-2xl border border-white/10 hover:border-amber-500/30 transition-colors group">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <span className="text-[11px] font-black text-slate-300 uppercase tracking-tight">{name}</span>
      </div>
      <div className="flex items-end justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-2xl font-black text-white">{price}</span>
          <Coins className="w-4 h-4 text-amber-500 mb-1" />
        </div>
        {unit && <span className="text-[9px] font-black text-slate-500 uppercase mb-1">{unit}</span>}
      </div>
    </div>
  );
}
