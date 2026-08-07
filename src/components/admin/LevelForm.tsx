import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Award } from 'lucide-react';

interface Props {
  /** Livello selezionato dalla tabella del parent per la modifica */
  editingLevel: any | null;
  /** Livelli esistenti: servono a proporre il livello successivo dopo il salvataggio */
  levels: any[];
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  onMessage: (message: { type: 'success' | 'error'; text: string }) => void;
  /** Chiamata dopo il salvataggio per far rifetchare i livelli al parent */
  onSaved: () => void;
}

export default function LevelForm({ editingLevel, levels, isLoading, setIsLoading, onMessage, onSaved }: Props) {
  const [newLevelForm, setNewLevelForm] = useState<{
    id: string;
    level: number | string;
    title: string;
    xp_required: number | string;
    reward_credits: number | string;
  }>({
    id: '',
    level: 1,
    title: '',
    xp_required: 0,
    reward_credits: 0
  });

  // Quando il parent seleziona un livello da modificare, carica i dati nel form
  useEffect(() => {
    if (editingLevel) setNewLevelForm(editingLevel);
  }, [editingLevel]);

  const handleSaveLevel = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const payload = { ...newLevelForm };
      if (!payload.id) delete (payload as any).id; // Let DB generate UUID
      const { error } = await supabase.from('gamification_levels').upsert(payload);
      if (error) throw error;
      onMessage({ type: 'success', text: `Livello ${newLevelForm.level} salvato con successo!` });
      setNewLevelForm({
        id: '', level: Math.max(...levels.map(l => l.level), 0) + 1, title: '', xp_required: 0, reward_credits: 0
      });
      onSaved();
    } catch (err: any) {
      console.error(err);
      onMessage({ type: 'error', text: 'Errore durante il salvataggio del livello: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
            <form onSubmit={handleSaveLevel} className="bg-[#f8f5f0] p-5 rounded-3xl border border-gray-100 space-y-4">
              <h4 className="font-black text-sm text-primary uppercase tracking-wider flex items-center gap-2">
                <Plus className="w-4 h-4 text-secondary" />
                Crea o Modifica Livello Gamification
              </h4>
              
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Livello</label>
                  <input 
                    type="number" 
                    value={newLevelForm.level}
                    onChange={e => setNewLevelForm({...newLevelForm, level: parseInt(e.target.value) || 1})}
                    className="w-full bg-white border-none rounded-xl p-3 text-xs font-bold"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Titolo (Status)</label>
                  <input 
                    type="text" 
                    placeholder="es. Esploratore" 
                    value={newLevelForm.title}
                    onChange={e => setNewLevelForm({...newLevelForm, title: e.target.value})}
                    className="w-full bg-white border-none rounded-xl p-3 text-xs font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">XP Richiesti</label>
                  <input 
                    type="number" 
                    value={newLevelForm.xp_required}
                    onChange={e => setNewLevelForm({...newLevelForm, xp_required: parseInt(e.target.value) || 0})}
                    className="w-full bg-white border-none rounded-xl p-3 text-xs font-bold"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Premio in Crediti</label>
                  <input 
                    type="number" 
                    value={newLevelForm.reward_credits}
                    onChange={e => setNewLevelForm({...newLevelForm, reward_credits: parseInt(e.target.value) || 0})}
                    className="w-full bg-white border-none rounded-xl p-3 text-xs font-bold"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-primary hover:opacity-95 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2"
              >
                <Award className="w-4 h-4 shrink-0" />
                Salva Livello
              </button>
            </form>
  );
}
