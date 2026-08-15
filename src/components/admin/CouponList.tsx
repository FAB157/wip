import React from 'react';
import { supabase } from '../../lib/supabase';
import { Hotel, Trash2, Copy } from 'lucide-react';

interface Props {
  coupons: any[];
  setIsLoading: (loading: boolean) => void;
  onMessage: (message: { type: 'success' | 'error'; text: string }) => void;
  /** Chiamata dopo ogni mutazione per far rifetchare i coupon al parent */
  onChanged: () => void;
}

export default function CouponList({ coupons, setIsLoading, onMessage, onChanged }: Props) {
  const toggleCouponStatus = async (coupon: any) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.from('coupons')
        .update({ is_active: !coupon.is_active })
        .eq('id', coupon.id);
      if (error) throw error;
      onMessage({ type: 'success', text: `Stato coupon ${coupon.code} aggiornato!` });
      onChanged();
    } catch (err: any) {
      console.error(err);
      onMessage({ type: 'error', text: 'Errore aggiornamento coupon: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteCoupon = async (id: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo coupon?")) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.from('coupons').delete().eq('id', id);
      if (error) throw error;
      onMessage({ type: 'success', text: `Coupon rimosso definitivamente.` });
      onChanged();
    } catch (err: any) {
      console.error(err);
      onMessage({ type: 'error', text: 'Errore eliminazione coupon: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
          <div className="space-y-3">
            <h4 className="font-black text-xs text-primary uppercase tracking-wider">Coupon Attivi nel Sistema</h4>
            <div className="overflow-x-auto no-scrollbar rounded-2xl border border-gray-100">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#f8f5f0] text-[10px] font-black uppercase tracking-wider text-on-surface-variant/60">
                  <tr>
                    <th className="p-4">Codice / Partner</th>
                    <th className="p-4">Crediti Regalo</th>
                    <th className="p-4">Utilizzi Riscattati</th>
                    <th className="p-4">Stato</th>
                    <th className="p-4 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {coupons.map((coupon) => (
                    <tr key={coupon.id} className="hover:bg-gray-50/50">
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-primary/5 text-primary flex items-center justify-center">
                            <Hotel className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-black text-primary bg-orange-50 text-orange-700 px-2 py-0.5 rounded-md text-[11px] uppercase tracking-wider mr-2">{coupon.code}</span>
                            <span className="text-xs text-on-surface-variant opacity-80">{coupon.structure_name}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-xs font-bold text-on-surface-variant">
                        {coupon.reward_credits || (coupon.duration_days * 10)} Crediti
                      </td>
                      <td className="p-4 text-xs font-medium">
                        <div className="w-full bg-gray-100 rounded-full h-2 max-w-[120px] mb-1.5 overflow-hidden">
                          <div 
                            className={`h-2 rounded-full transition-all ${coupon.uses_count >= coupon.max_uses ? 'bg-red-500' : 'bg-primary'}`} 
                            style={{ width: `${Math.min(100, (coupon.uses_count / coupon.max_uses) * 100)}%` }}
                          ></div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`font-black ${coupon.uses_count >= coupon.max_uses ? 'text-red-500' : 'text-primary'}`}>
                            {coupon.uses_count}
                          </span>
                          <span className="text-on-surface-variant/60 font-bold">/</span>
                          <span className="text-on-surface-variant font-bold">{coupon.max_uses}</span>
                          {coupon.uses_count >= coupon.max_uses && (
                            <span className="ml-1 text-[9px] font-black uppercase text-red-500 tracking-wider bg-red-50 px-1.5 py-0.5 rounded">Esaurito</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <button
                          onClick={() => toggleCouponStatus(coupon)}
                          className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${
                            coupon.is_active 
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' 
                              : 'bg-red-50 text-red-700 hover:bg-red-100'
                          }`}
                        >
                          {coupon.is_active ? 'Attivo' : 'Sospeso'}
                        </button>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(coupon.code);
                                onMessage({ type: 'success', text: `Codice ${coupon.code} copiato negli appunti.` });
                              } catch {
                                onMessage({ type: 'error', text: 'Copia non riuscita: seleziona e copia il codice a mano.' });
                              }
                            }}
                            className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
                            title="Copia il codice (da inviare alla struttura)"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteCoupon(coupon.id)}
                            className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                            title="Elimina coupon"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {coupons.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-500 font-medium text-xs">
                        Nessun coupon nel sistema. Creane uno col form qui sopra.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
  );
}
