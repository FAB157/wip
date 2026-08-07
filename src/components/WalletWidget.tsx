import { useState, useEffect } from 'react';
import { getWalletBalance, WalletBalance } from '../lib/pricing';
import { supabase } from '../lib/supabase';

interface WalletWidgetProps {
  userId: string;
}

export default function WalletWidget({ userId }: WalletWidgetProps) {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchBalance();
    
    // Subscribe to profile changes to update credits in real-time
    const channel = supabase
      .channel('wallet_updates')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'user_profiles',
        filter: `id=eq.${userId}`
      }, (payload) => {
        const { purchased_credits, earned_credits } = payload.new;
        setBalance({
          purchased: purchased_credits || 0,
          earned: earned_credits || 0,
          total: (purchased_credits || 0) + (earned_credits || 0)
        });
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const fetchBalance = async () => {
    const bal = await getWalletBalance(userId);
    setBalance(bal);
  };

  if (!balance) return null;

  return (
    <div 
      className="relative flex items-center gap-2 cursor-pointer bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200 shadow-sm"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="text-lg">🪙</div>
      <div className="font-bold text-amber-700">{balance.total}</div>
      
      {expanded && (
        <div className="absolute top-full mt-2 right-0 bg-white border border-slate-200 shadow-lg rounded-xl p-3 z-50 w-48 text-sm">
          <div className="font-bold text-slate-800 mb-2 border-b pb-1">Il tuo Portafoglio</div>
          <div className="flex justify-between text-amber-600 mb-1">
            <span>Crediti Vinti:</span>
            <span className="font-bold">{balance.earned}</span>
          </div>
          <div className="flex justify-between text-blue-600">
            <span>Crediti Acquistati:</span>
            <span className="font-bold">{balance.purchased}</span>
          </div>
          <div className="mt-3 text-[10px] text-slate-500 text-center leading-tight">
            I crediti vinti giocando vengono consumati sempre per primi.
          </div>
        </div>
      )}
    </div>
  );
}
