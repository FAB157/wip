import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabase';
import { Building2, Download, CheckCircle, Package, Coins, ShieldCheck, Ticket } from 'lucide-react';
import { Language, getTranslation } from '../lib/i18n';
import { Capacitor } from '@capacitor/core';
import { getApiUrl } from '../lib/api';

interface B2BPartnerProps {
  userSession: any;
  language: Language;
}

export default function B2BPartner({ userSession, language }: B2BPartnerProps) {
  const [structureName, setStructureName] = useState('');
  const [hotelCoupons, setHotelCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [searched, setSearched] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    // Check url params
    const params = new URLSearchParams(window.location.search);
    if (params.get('b2bsuccess') === 'true') {
      setIsSuccess(true);
    }
  }, []);

  const fetchCoupons = async (name: string) => {
    if (!name) return;
    setLoading(true);
    setFetchError(null);
    // Errore gestito e lista sempre aggiornata: prima un errore veniva
    // ignorato e con 0 risultati restava a video l'elenco della ricerca
    // precedente, senza alcun "nessun coupon trovato".
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .ilike('structure_name', name)
      .order('created_at', { ascending: false });

    if (error) {
      setFetchError('Ricerca non riuscita, riprova.');
      setHotelCoupons([]);
    } else {
      setHotelCoupons(data || []);
    }
    setSearched(true);
    setLoading(false);
  };

  const purchasePackage = async (packageType: string) => {
    if (!structureName) {
      alert(getTranslation("b2b_alert_fill_name", language));
      return;
    }
    
    if (Capacitor.isNativePlatform()) {
      // Vale per Google Play E App Store: i pacchetti B2B si acquistano dal sito.
      alert(getTranslation("b2b_error", language) + ": Gli acquisti in-app tramite store saranno disponibili a breve. Per ora, visita il nostro sito web per gestire l'acquisto dei pacchetti.");
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch(getApiUrl('/api/b2b-checkout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageType,
          structureName,
          userEmail: userSession?.user?.email || '',
          userId: userSession?.user?.id || ''
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Creazione checkout fallita');
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('Nessun link di pagamento ricevuto dal server.');
      }
    } catch (e: any) {
      console.error(e);
      alert(getTranslation("b2b_error", language) + ": " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCSV = () => {
    if (hotelCoupons.length === 0) return;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += `${getTranslation("b2b_csv_header_code", language)},${getTranslation("b2b_csv_header_status", language)},${getTranslation("b2b_csv_header_expiry", language)}\n`;
    
    hotelCoupons.forEach(c => {
       const status = c.uses_count >= c.max_uses ? getTranslation("b2b_used", language) : getTranslation("b2b_available", language);
       csvContent += `${c.code},${status},${c.duration_days} ${getTranslation("b2b_csv_days", language)}\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `coupon_${structureName}.csv`);
    document.body.appendChild(link);
    link.click();
  };

  return (
    // Stessa veste grafica dello Shop: fondo slate-50, card bianche rounded-2xl
    // con bordo slate-200, blu primario #1e3a8a, titoli font-black e padding
    // inferiore con safe-area per la gesture bar Android.
    <div className="bg-slate-50 rounded-3xl text-slate-800 p-4 pb-[calc(4rem+env(safe-area-inset-bottom))] overflow-y-auto overscroll-contain selection:bg-[#1e3a8a]/20">
      <div className="max-w-4xl mx-auto flex flex-col pt-2">

        {/* Header hero — gradiente sul blu primario come la card in evidenza dello Shop */}
        <div className="mb-6 bg-gradient-to-br from-[#1e3a8a] to-blue-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-2xl font-black mb-1">{getTranslation("b2b_title", language)}</h2>
            <p className="text-blue-100 text-sm max-w-xl">{getTranslation("b2b_desc", language)}</p>
          </div>
          <Building2 className="absolute -right-4 -bottom-4 w-32 h-32 text-white/10 pointer-events-none" />
        </div>

        {isSuccess && (
          <div className="mb-6 bg-emerald-50 border border-emerald-200 p-4 rounded-2xl text-emerald-800 flex items-center gap-3">
            <CheckCircle className="w-7 h-7 shrink-0" />
            <div className="min-w-0">
              <h3 className="font-black leading-tight">{getTranslation("b2b_success_title", language)}</h3>
              <p className="text-xs font-medium opacity-80 mt-0.5">{getTranslation("b2b_success_desc", language)}</p>
            </div>
          </div>
        )}

        {/* Ricerca struttura */}
        <h3 className="font-bold text-slate-500 uppercase text-xs mb-3 ml-1 tracking-wider">
          {getTranslation("b2b_structure_title", language)}
        </h3>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 mb-8 overflow-hidden">
          <div className="flex items-center gap-3 p-4 pb-3">
            <div className="w-11 h-11 rounded-xl bg-[#1e3a8a]/10 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-[#1e3a8a]" />
            </div>
            <div className="min-w-0">
              <h4 className="font-black text-slate-800 leading-tight">{getTranslation("b2b_structure_title", language)}</h4>
              <p className="text-xs text-slate-500 mt-0.5">{getTranslation("b2b_coupons_desc", language)}</p>
            </div>
          </div>
          <div className="px-4 pb-4 flex gap-2">
            <input
              type="text"
              placeholder={getTranslation("b2b_structure_placeholder", language)}
              value={structureName}
              onChange={(e) => setStructureName(e.target.value)}
              className="flex-1 min-w-0 px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#1e3a8a] focus:bg-white transition-colors font-bold text-slate-800 placeholder:font-normal placeholder:text-slate-400"
            />
            <button
              onClick={() => fetchCoupons(structureName)}
              disabled={loading}
              className="shrink-0 bg-[#1e3a8a] text-white font-bold px-5 py-3 rounded-xl hover:bg-blue-900 active:scale-95 transition disabled:opacity-40 cursor-pointer"
            >
              {getTranslation("b2b_search", language)}
            </button>
          </div>
        </div>

        {/* Pacchetti voucher — card verticali come i pacchetti crediti dello Shop */}
        <h3 className="font-bold text-slate-500 uppercase text-xs mb-3 ml-1 tracking-wider">
          Pacchetti Voucher
        </h3>
        <div className="flex flex-col gap-4 mb-8">
          {/* Quantità e prezzi allineati al server (/api/b2b-checkout), che è
              ciò che genera i coupon e addebita davvero: prima la UI
              prometteva 100 voucher a €149 ma Stripe addebitava €99 per 50.
              Ogni voucher regala CREDITI all'ospite. */}
          <motion.div whileTap={{ scale: 0.98 }} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between gap-3 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-[#cd7f32] text-white text-[10px] font-black px-2.5 py-1 rounded-bl-xl tracking-wide">
              BRONZE
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-[#cd7f32]/10 flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-[#cd7f32]" />
              </div>
              <div className="min-w-0">
                <h4 className="font-black text-lg text-slate-800 leading-tight">Bronze</h4>
                <p className="text-xs text-slate-400 mb-1.5">Ideale per piccoli B&B</p>
                <p className="text-slate-600 text-sm flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-amber-500" />
                  <span className="font-bold">50 Voucher da 500 crediti</span>
                </p>
              </div>
            </div>
            <button
              onClick={() => purchasePackage('bronze')}
              disabled={loading}
              title={getTranslation("b2b_purchase", language)}
              className="shrink-0 bg-white text-[#1e3a8a] font-black px-5 py-2.5 rounded-xl border-2 border-[#1e3a8a]/20 hover:border-[#1e3a8a]/50 active:scale-95 transition disabled:opacity-50 cursor-pointer"
            >
              €99
            </button>
          </motion.div>

          <motion.div whileTap={{ scale: 0.98 }} className="bg-gradient-to-br from-[#1e3a8a] to-blue-700 p-5 rounded-2xl shadow-lg shadow-blue-900/25 flex items-center justify-between gap-3 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-amber-400 text-blue-950 text-[10px] font-black px-2.5 py-1 rounded-bl-xl tracking-wide uppercase">
              {getTranslation("b2b_best_seller", language)}
            </div>
            <Package className="absolute -right-5 -bottom-6 w-24 h-24 text-white/10 pointer-events-none" />
            <div className="relative flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h4 className="font-black text-lg text-white leading-tight">Silver</h4>
                <p className="text-xs text-blue-200 mb-1.5">Per hotel e strutture attive</p>
                <p className="text-blue-100 text-sm flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-amber-400" />
                  <span className="font-black text-white">150 Voucher da 500 crediti</span>
                </p>
              </div>
            </div>
            <button
              onClick={() => purchasePackage('silver')}
              disabled={loading}
              title={getTranslation("b2b_purchase", language)}
              className="relative shrink-0 bg-white text-[#1e3a8a] font-black px-5 py-2.5 rounded-xl shadow-md active:scale-95 transition disabled:opacity-50 cursor-pointer"
            >
              €249
            </button>
          </motion.div>

          <motion.div whileTap={{ scale: 0.98 }} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between gap-3 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-[#d4af37] text-white text-[10px] font-black px-2.5 py-1 rounded-bl-xl tracking-wide">
              GOLD
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-[#d4af37]/10 flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-[#d4af37]" />
              </div>
              <div className="min-w-0">
                <h4 className="font-black text-lg text-slate-800 leading-tight">Gold</h4>
                <p className="text-xs text-slate-400 mb-1.5">Soluzione All-inclusive</p>
                <p className="text-slate-600 text-sm flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-amber-500" />
                  <span className="font-bold">500 Voucher da 500 crediti</span>
                </p>
              </div>
            </div>
            <button
              onClick={() => purchasePackage('gold')}
              disabled={loading}
              title={getTranslation("b2b_purchase", language)}
              className="shrink-0 bg-white text-[#1e3a8a] font-black px-5 py-2.5 rounded-xl border-2 border-[#1e3a8a]/20 hover:border-[#1e3a8a]/50 active:scale-95 transition disabled:opacity-50 cursor-pointer"
            >
              €599
            </button>
          </motion.div>
        </div>

        {fetchError && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-2xl text-sm font-bold text-red-700 mb-6">{fetchError}</div>
        )}
        {searched && !fetchError && hotelCoupons.length === 0 && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 text-center text-sm font-bold text-slate-500 mb-6">
            Nessun coupon trovato per "{structureName}". Acquista un pacchetto qui sopra per generarli.
          </div>
        )}
        {hotelCoupons.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
            <div className="flex justify-between items-center gap-3 p-4 pb-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-[#1e3a8a]/10 flex items-center justify-center shrink-0">
                  <Ticket className="w-5 h-5 text-[#1e3a8a]" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-black text-slate-800 leading-tight">{getTranslation("b2b_coupons_title", language)}</h3>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{getTranslation("b2b_coupons_desc", language)} {structureName}</p>
                </div>
              </div>
              <button
                onClick={handleDownloadCSV}
                className="shrink-0 flex items-center gap-2 bg-[#1e3a8a]/10 text-[#1e3a8a] px-4 py-2.5 rounded-xl font-bold hover:bg-[#1e3a8a]/20 active:scale-95 transition cursor-pointer"
              >
                <Download className="w-4 h-4" /> {getTranslation("b2b_download_csv", language)}
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-h-[400px] overflow-y-auto px-4 pb-4">
              {hotelCoupons.map((coupon) => {
                 const isUsed = coupon.uses_count >= coupon.max_uses;
                 return (
                   <div key={coupon.id} className={`p-4 rounded-2xl border ${isUsed ? 'bg-slate-50 border-slate-200 opacity-50' : 'bg-emerald-50/60 border-emerald-200'} flex flex-col items-center text-center`}>
                     <span className={`font-mono font-black text-lg ${isUsed ? 'text-slate-400' : 'text-emerald-700'}`}>{coupon.code}</span>
                     <span className={`text-[10px] font-bold uppercase tracking-widest mt-2 ${isUsed ? 'text-red-500' : 'text-[#1e3a8a]'}`}>
                        {isUsed ? getTranslation("b2b_used", language) : getTranslation("b2b_available", language)}
                     </span>
                   </div>
                 );
              })}
            </div>
          </div>
        )}

        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4" /> Pagamenti sicuri criptati
        </div>
      </div>
    </div>
  );
}
