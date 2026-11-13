/**
 * SELETTORE «AUDIOGUIDA GRATIS» (22/10/2026, committente: «le audioguide possono avere un selettore che le rende
 * gratis … quelle segnalate dagli enti … nella scheda deve esserci un selettore, come admin»).
 * Solo admin. Scrive technical_data.audioguida_gratis via POST /api/admin/poi/update. Acceso = l'audioguida del
 * luogo si ascolta senza crediti né pass, per tutti, e all'arrivo parte direttamente.
 */
import { useState } from 'react';
import { Gift, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getApiUrl } from '../lib/api';
import { notify } from '../lib/toast';

interface Props {
  poiId: string;
  valore: boolean;
  onCambio: (v: boolean) => void;
}

export default function AudioGratisSelettore({ poiId, valore, onCambio }: Props) {
  const [busy, setBusy] = useState(false);

  const cambia = async () => {
    if (busy || !poiId) return;
    const nuovo = !valore;
    setBusy(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch(getApiUrl('/api/admin/poi/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ poiId, changes: { audioguida_gratis: nuovo }, reason: 'selettore audioguida gratis (scheda)' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      onCambio(nuovo);
      notify(nuovo ? 'Audioguida GRATIS per tutti' : 'Audioguida di nuovo a pagamento', 'success');
    } catch (e: any) {
      notify(`Selettore non salvato: ${e?.message || ''}`.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={cambia}
      disabled={busy}
      role="switch"
      aria-checked={valore}
      className={`mb-6 w-full flex items-center justify-between gap-2 py-2.5 px-4 rounded-xl text-[12px] font-black border transition-all active:scale-95 ${
        valore ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
      } disabled:opacity-70`}
    >
      <span className="flex items-center gap-2">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
        Audioguida gratis
        <span className="text-[9px] font-bold uppercase tracking-wide opacity-60">admin</span>
      </span>
      <span className={`relative inline-block w-10 h-5 rounded-full transition-colors ${valore ? 'bg-emerald-500' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${valore ? 'left-5' : 'left-0.5'}`} />
      </span>
    </button>
  );
}
