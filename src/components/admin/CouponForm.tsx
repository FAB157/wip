import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Award } from 'lucide-react';

interface Props {
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  onMessage: (message: { type: 'success' | 'error'; text: string }) => void;
  /** Chiamata dopo la creazione per far rifetchare i coupon al parent */
  onCreated: () => void;
}

export default function CouponForm({ isLoading, setIsLoading, onMessage, onCreated }: Props) {
  // Coupon Creation states
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newStructureName, setNewStructureName] = useState('');
  const [newRewardCredits, setNewRewardCredits] = useState('500');
  const [newMaxUses, setNewMaxUses] = useState('50');

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCouponCode || !newStructureName) {
      onMessage({ type: 'error', text: 'Compila tutti i campi richiesti!' });
      return;
    }

    setIsLoading(true);
    try {
      const codeUpper = newCouponCode.trim().toUpperCase();
      const credits = parseInt(newRewardCredits);
      const limitUses = parseInt(newMaxUses);

      const newCoupon = {
        code: codeUpper,
        structure_name: newStructureName,
        reward_credits: credits,
        duration_days: 0, // deprecato ma mantenuto per compatibilità DB temporanea
        max_uses: limitUses,
        uses_count: 0,
        is_active: true
      };

      const { error } = await supabase.from('coupons').upsert(newCoupon);
      if (error) throw error;

      // Reset inputs
      setNewCouponCode('');
      setNewStructureName('');
      // // setNewDurationDays('7');
      setNewMaxUses('50');

      onMessage({ type: 'success', text: `Coupon ${codeUpper} creato per ${newStructureName}!` });
      onCreated();
    } catch (err: any) {
      console.error(err);
      onMessage({ type: 'error', text: 'Errore creazione coupon: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
          <form onSubmit={handleCreateCoupon} className="bg-[#f8f5f0] p-5 rounded-3xl border border-gray-100 space-y-4">
            <h4 className="font-black text-sm text-primary uppercase tracking-wider flex items-center gap-2">
              <Plus className="w-4 h-4 text-secondary" />
              Crea Nuovo Coupon Partner B2B
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Codice Coupon</label>
                <input 
                  type="text" 
                  placeholder="es. MILANO14" 
                  value={newCouponCode}
                  onChange={e => setNewCouponCode(e.target.value)}
                  className="w-full bg-white border-none rounded-xl p-3 text-xs font-bold uppercase placeholder:lowercase"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Nome Struttura Partner</label>
                <input 
                  type="text" 
                  placeholder="Hotel, Residence, B&B" 
                  value={newStructureName}
                  onChange={e => setNewStructureName(e.target.value)}
                  className="w-full bg-white border-none rounded-xl p-3 text-xs font-bold"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Crediti Regalo (per utente)</label>
                <select 
                  value={newRewardCredits}
                  onChange={e => setNewRewardCredits(e.target.value)}
                  className="w-full bg-white border-none rounded-xl p-3 text-xs font-bold"
                >
                  <option value="100">100 Crediti</option>
                  <option value="250">250 Crediti</option>
                  <option value="500">500 Crediti (Consigliato)</option>
                  <option value="1000">1000 Crediti</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Riscatti Massimi</label>
                <input 
                  type="number" 
                  value={newMaxUses}
                  onChange={e => setNewMaxUses(e.target.value)}
                  className="w-full bg-white border-none rounded-xl p-3 text-xs font-bold"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-primary hover:opacity-95 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2"
            >
              <Award className="w-4 h-4 shrink-0" />
              Genera e Attiva Coupon
            </button>
          </form>
  );
}
