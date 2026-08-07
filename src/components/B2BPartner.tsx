import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Building2, Download, CheckCircle, Package, ArrowLeft } from 'lucide-react';
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
    <div className="bg-[#f0f2eb] rounded-3xl text-on-surface p-4 overflow-y-auto selection:bg-primary/20">
      <div className="max-w-4xl mx-auto space-y-6 flex flex-col pt-4">
        
        <div className="bg-[#1e3a8a] rounded-3xl p-8 text-white relative overflow-hidden shadow-xl">
          <Building2 className="absolute right-0 bottom-0 w-64 h-64 opacity-10 -mr-12 -mb-12" />
          <h2 className="text-3xl font-black mb-2">{getTranslation("b2b_title", language)}</h2>
          <p className="text-white/80 max-w-xl relative object-contain z-10">{getTranslation("b2b_desc", language)}</p>
        </div>

        {isSuccess && (
          <div className="bg-secondary/10 border border-secondary/20 p-6 rounded-3xl text-secondary flex items-center gap-4">
            <CheckCircle className="w-8 h-8" />
            <div>
              <h3 className="font-black text-lg">{getTranslation("b2b_success_title", language)}</h3>
              <p className="text-sm font-medium opacity-80">{getTranslation("b2b_success_desc", language)}</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-3xl p-6 shadow-sm border border-outline-variant/10">
          <h3 className="font-black text-xl mb-4 text-[#1e3a8a]">{getTranslation("b2b_structure_title", language)}</h3>
          <div className="flex gap-2 mb-6">
            <input 
              type="text" 
              placeholder={getTranslation("b2b_structure_placeholder", language)} 
              value={structureName}
              onChange={(e) => setStructureName(e.target.value)}
              className="flex-1 bg-surface py-3 px-4 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 transition-all border border-transparent border-gray-200"
            />
            <button 
              onClick={() => fetchCoupons(structureName)}
              className="px-6 bg-[#1e3a8a] text-white rounded-xl font-bold hover:bg-[#1e3a8a]/90 transition-colors cursor-pointer"
            >
              {getTranslation("b2b_search", language)}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="border border-outline-variant/20 rounded-3xl p-6 flex flex-col items-center text-center space-y-4 hover:border-bronze hover:shadow-lg transition-all relative overflow-hidden bg-gradient-to-b from-white to-[#cd7f32]/5">
              <Package className="w-12 h-12 text-[#cd7f32]" />
              <h4 className="font-black text-2xl text-on-surface">Bronze</h4>
              {/* Quantità e prezzi allineati al server (/api/b2b-checkout), che è
                  ciò che genera i coupon e addebita davvero: prima la UI
                  prometteva 100 voucher a €149 ma Stripe addebitava €99 per 50.
                  Ogni voucher regala CREDITI all'ospite. */}
              <p className="text-sm text-on-surface-variant font-medium">50 Voucher da 500 🪙<br/><span className="text-xs opacity-70">Ideale per piccoli B&B</span></p>
              <p className="text-[#cd7f32] font-black text-3xl">€99</p>
              <button 
                onClick={() => purchasePackage('bronze')}
                disabled={loading}
                className="w-full py-3 bg-[#cd7f32] text-white rounded-xl font-bold mt-4 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
              >
                {getTranslation("b2b_purchase", language)}
              </button>
            </div>
            
            <div className="border-2 border-[#1e3a8a] rounded-3xl p-6 flex flex-col items-center text-center space-y-4 shadow-xl relative overflow-hidden bg-gradient-to-b from-white to-[#1e3a8a]/5">
              <div className="absolute top-0 w-full bg-[#1e3a8a] text-white text-xs font-bold py-1">{getTranslation("b2b_best_seller", language)}</div>
              <Package className="w-12 h-12 text-slate-400 mt-4" />
              <h4 className="font-black text-2xl text-on-surface">Silver</h4>
              <p className="text-sm text-on-surface-variant font-medium">150 Voucher da 500 🪙<br/><span className="text-xs opacity-70">Per hotel e strutture attive</span></p>
              <p className="text-slate-500 font-black text-3xl">€249</p>
              <button 
                onClick={() => purchasePackage('silver')}
                disabled={loading}
                className="w-full py-3 bg-[#1e3a8a] text-white rounded-xl font-bold mt-4 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
              >
                {getTranslation("b2b_purchase", language)}
              </button>
            </div>
            
            <div className="border border-outline-variant/20 rounded-3xl p-6 flex flex-col items-center text-center space-y-4 hover:border-[#ffd700] hover:shadow-lg transition-all relative overflow-hidden bg-gradient-to-b from-white to-[#ffd700]/10">
              <Package className="w-12 h-12 text-[#d4af37]" />
              <h4 className="font-black text-2xl text-on-surface">Gold</h4>
              <p className="text-sm text-on-surface-variant font-medium">500 Voucher da 500 🪙<br/><span className="text-xs opacity-70">Soluzione All-inclusive</span></p>
              <p className="text-[#d4af37] font-black text-3xl">€599</p>
              <button 
                onClick={() => purchasePackage('gold')}
                disabled={loading}
                className="w-full py-3 bg-[#d4af37] text-white rounded-xl font-bold mt-4 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
              >
                {getTranslation("b2b_purchase", language)}
              </button>
            </div>
          </div>
        </div>

        {fetchError && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-2xl text-sm font-bold text-red-700">{fetchError}</div>
        )}
        {searched && !fetchError && hotelCoupons.length === 0 && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-outline-variant/10 text-center text-sm font-bold text-on-surface-variant">
            Nessun coupon trovato per "{structureName}". Acquista un pacchetto qui sopra per generarli.
          </div>
        )}
        {hotelCoupons.length > 0 && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-outline-variant/10 mt-6">
            <div className="flex justify-between items-end mb-6">
              <div>
                <h3 className="font-black text-xl text-[#1e3a8a]">{getTranslation("b2b_coupons_title", language)}</h3>
                <p className="text-sm font-medium text-on-surface-variant opacity-80">{getTranslation("b2b_coupons_desc", language)} {structureName}</p>
              </div>
              <button 
                onClick={handleDownloadCSV}
                className="flex items-center gap-2 bg-[#1e3a8a]/10 text-[#1e3a8a] px-4 py-2 rounded-xl font-bold hover:bg-[#1e3a8a]/20 transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" /> {getTranslation("b2b_download_csv", language)}
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-h-[400px] overflow-y-auto pr-2">
              {hotelCoupons.map((coupon) => {
                 const isUsed = coupon.uses_count >= coupon.max_uses;
                 return (
                   <div key={coupon.id} className={`p-4 rounded-2xl border ${isUsed ? 'bg-surface border-outline-variant/20 opacity-50' : 'bg-secondary/5 border-secondary/20'} flex flex-col items-center text-center`}>
                     <span className={`font-mono font-black text-lg ${isUsed ? 'text-on-surface-variant' : 'text-secondary'}`}>{coupon.code}</span>
                     <span className={`text-xs font-bold uppercase tracking-widest mt-2 ${isUsed ? 'text-red-500' : 'text-primary'}`}>
                        {isUsed ? getTranslation("b2b_used", language) : getTranslation("b2b_available", language)}
                     </span>
                   </div>
                 );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
