import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Award } from 'lucide-react';

interface Props {
  /** Sfida selezionata dalla tabella del parent per la modifica */
  editingChallenge: any | null;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  onMessage: (message: { type: 'success' | 'error'; text: string }) => void;
  /** Chiamata dopo il salvataggio per far rifetchare le sfide al parent */
  onSaved: () => void;
}

export default function ChallengeForm({ editingChallenge, isLoading, setIsLoading, onMessage, onSaved }: Props) {
  // Gamification Challenge Form State
  const [newChallengeForm, setNewChallengeForm] = useState<{
    id: string;
    name: string;
    icon: string;
    category_trigger: string;
    threshold: number | string;
    reward_credits: number | string;
  }>({
    id: '',
    name: '',
    icon: '🏆',
    category_trigger: 'all',
    threshold: 5,
    reward_credits: 0
  });

  // Quando il parent seleziona una sfida da modificare, carica i dati nel form
  useEffect(() => {
    if (editingChallenge) setNewChallengeForm(editingChallenge);
  }, [editingChallenge]);

  const handleSaveChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { error } = await supabase.from('gamification_challenges').upsert(newChallengeForm);
      if (error) throw error;
      onMessage({ type: 'success', text: `Sfida ${newChallengeForm.name} salvata con successo!` });
      setNewChallengeForm({
        id: '',
        name: '',
        icon: '🏆',
        category_trigger: 'all',
        threshold: 5,
        reward_credits: 0
      });
      onSaved();
    } catch (err: any) {
      console.error(err);
      onMessage({ type: 'error', text: 'Errore durante il salvataggio della sfida: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
          <form onSubmit={handleSaveChallenge} className="bg-[#f8f5f0] p-5 rounded-3xl border border-gray-100 space-y-4">
            <h4 className="font-black text-sm text-primary uppercase tracking-wider flex items-center gap-2">
              <Plus className="w-4 h-4 text-secondary" />
              Crea o Modifica Sfida Gamification
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">ID Sfida (Unico)</label>
                <input 
                  type="text" 
                  placeholder="es. pioniere" 
                  value={newChallengeForm.id}
                  onChange={e => setNewChallengeForm({...newChallengeForm, id: e.target.value})}
                  className="w-full bg-white border-none rounded-xl p-3 text-xs font-bold"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Nome Pubblico</label>
                <input 
                  type="text" 
                  placeholder="es. Pioniere" 
                  value={newChallengeForm.name}
                  onChange={e => setNewChallengeForm({...newChallengeForm, name: e.target.value})}
                  className="w-full bg-white border-none rounded-xl p-3 text-xs font-bold"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Emoji/Icona</label>
                <input
                  type="text"
                  placeholder="es. 🧭"
                  value={newChallengeForm.icon}
                  onChange={e => setNewChallengeForm({...newChallengeForm, icon: e.target.value})}
                  className="w-full bg-white border-none rounded-xl p-3 text-xs font-bold"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Categoria da Visitare</label>
                <select 
                  value={newChallengeForm.category_trigger}
                  onChange={e => setNewChallengeForm({...newChallengeForm, category_trigger: e.target.value})}
                  className="w-full bg-white border-none rounded-xl p-3 text-xs font-bold"
                >
                  {/* I valori DEVONO combaciare con le categorie reali dei POI
                      nella cronologia ascolti (monumenti/chiese/musei/panorami/
                      locali...): i vecchi 'monument'/'parchi' non matchavano
                      mai e le sfide restavano bloccate a 0. */}
                  <option value="all">Tutti (Qualsiasi Luogo)</option>
                  <option value="monumenti">Monumenti & Castelli</option>
                  <option value="chiese">Chiese & Luoghi di Culto</option>
                  <option value="musei">Musei & Gallerie</option>
                  <option value="panorami">Panorami & Parchi</option>
                  <option value="gemme">Gemme 💎</option>
                  <option value="locali">Locali & Ristoranti</option>
                  <option value="esperienze_locali">Esperienze (Forni/Botteghe)</option>
                  <option value="utilita">Utilità (Fontanelle)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Luoghi Necessari</label>
                <input 
                  type="number" 
                  value={newChallengeForm.threshold}
                  onChange={e => setNewChallengeForm({...newChallengeForm, threshold: Math.max(1, parseInt(e.target.value) || 1)})}
                  className="w-full bg-white border-none rounded-xl p-3 text-xs font-bold"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Premio al Raggiungimento (Crediti)</label>
                <div className="flex gap-2">
                  <input 
                    type="number" 
                    value={newChallengeForm.reward_credits}
                    onChange={e => setNewChallengeForm({...newChallengeForm, reward_credits: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0)})}
                    className="w-full bg-white border-none rounded-xl p-3 text-xs font-bold"
                    title="Crediti"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-primary hover:opacity-95 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2"
            >
              <Award className="w-4 h-4 shrink-0" />
              Salva Sfida
            </button>
          </form>
  );
}
