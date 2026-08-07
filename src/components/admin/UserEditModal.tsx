import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { UserProfile } from '../../lib/quotaManager';

interface Props {
  /** Utente in modifica: il parent monta il modale solo quando presente */
  user: UserProfile;
  setIsLoading: (loading: boolean) => void;
  onMessage: (message: { type: 'success' | 'error'; text: string }) => void;
  onClose: () => void;
  /** Chiamata dopo il salvataggio per far rifetchare gli utenti al parent */
  onSaved: () => void;
}

export default function UserEditModal({ user, setIsLoading, onMessage, onClose, onSaved }: Props) {
  const [editPurchasedCredits, setEditPurchasedCredits] = useState<number | string>(user.purchased_credits || 0);
  const [editEarnedCredits, setEditEarnedCredits] = useState<number | string>(user.earned_credits || 0);
  const [editIsAdmin, setEditIsAdmin] = useState(user.is_admin || false);
  // Limiti custom: nessun input dedicato nel modale (come prima), ma i valori
  // esistenti vengono preservati nel salvataggio.
  const [editCustomLimitItinerary] = useState(user.custom_limit_itinerary?.toString() || '');
  const [editCustomLimitAudioGuide] = useState(user.custom_limit_audio_guide?.toString() || '');

  const saveUserChanges = async () => {
    setIsLoading(true);
    try {
      const updatedProfile: UserProfile = {
        ...user,
        purchased_credits: typeof editPurchasedCredits === 'string' ? parseInt(editPurchasedCredits) || 0 : editPurchasedCredits,
        earned_credits: typeof editEarnedCredits === 'string' ? parseInt(editEarnedCredits) || 0 : editEarnedCredits,
        is_admin: editIsAdmin,
        custom_limit_itinerary: editCustomLimitItinerary ? parseInt(editCustomLimitItinerary) : null,
        custom_limit_audio_guide: editCustomLimitAudioGuide ? parseInt(editCustomLimitAudioGuide) : null
      };

      const { error } = await supabase.from('user_profiles').update({
        purchased_credits: updatedProfile.purchased_credits,
        earned_credits: updatedProfile.earned_credits,
        is_admin: updatedProfile.is_admin,
        custom_limit_itinerary: updatedProfile.custom_limit_itinerary,
        custom_limit_audio_guide: updatedProfile.custom_limit_audio_guide,
        subscription_tier: updatedProfile.subscription_tier
      }).eq('id', updatedProfile.id);

      if (error) throw error;

      onClose();
      onMessage({ type: 'success', text: `Profilo di ${user.email} aggiornato con successo!` });
      onSaved();
    } catch (err: any) {
      console.error(err);
      // Solo il banner del parent (niente alert nativo duplicato) e messaggi
      // Postgres/RLS tradotti in italiano comprensibile.
      const raw = String(err?.message || '');
      let friendly = 'Errore durante il salvataggio.';
      if (/permission denied|row-level security|RLS/i.test(raw)) friendly = 'Permesso negato: il tuo utente non ha i privilegi per questa modifica.';
      else if (/violates.*constraint|duplicate key/i.test(raw)) friendly = 'Dati non validi: la modifica viola un vincolo del database.';
      else if (/network|fetch|timeout/i.test(raw)) friendly = 'Problema di connessione: riprova tra qualche secondo.';
      else if (raw) friendly = `Errore durante il salvataggio: ${raw}`;
      onMessage({ type: 'error', text: friendly });
    } finally {
      setIsLoading(false);
    }
  };

  return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-gray-100 shadow-2xl space-y-4">
            <div>
              <h4 className="font-black text-lg text-primary">Modifica Privilegi Utente</h4>
              <p className="text-xs text-on-surface-variant font-medium opacity-80 mt-1">
                Configura i privilegi di abbonamento per {user.email}
              </p>
            </div>

            <div className="space-y-4">
              {/* Credits inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Crediti Acquistati</label>
                  <input 
                    type="number" 
                    value={editPurchasedCredits}
                    onChange={e => setEditPurchasedCredits(e.target.value)}
                    className="w-full bg-[#f8f5f0] border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-[#1e3a8a]/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Crediti Ottenuti (XP)</label>
                  <input 
                    type="number" 
                    value={editEarnedCredits}
                    onChange={e => setEditEarnedCredits(e.target.value)}
                    className="w-full bg-[#f8f5f0] border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-[#1e3a8a]/20"
                  />
                </div>
              </div>

              {/* Admin Flag */}
              <div className="flex items-center gap-3 bg-[#f8f5f0] p-3 rounded-xl">
                <input 
                  type="checkbox" 
                  id="is_admin"
                  checked={editIsAdmin}
                  onChange={e => setEditIsAdmin(e.target.checked)}
                  className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-[#1e3a8a]/20"
                />
                <label htmlFor="is_admin" className="text-xs font-bold text-on-surface cursor-pointer select-none">
                  Amministratore del Pannello B2B
                </label>
              </div>

            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 bg-[#f8f5f0] hover:bg-gray-100 text-on-surface font-black text-xs rounded-xl"
              >
                ANNULLA
              </button>
              <button
                type="button"
                onClick={saveUserChanges}
                className="flex-1 py-2.5 bg-primary hover:opacity-95 text-white font-black text-xs rounded-xl"
              >
                SALVA
              </button>
            </div>
          </div>
        </div>
  );
}
