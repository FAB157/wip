import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Award, AlertTriangle } from 'lucide-react';

/**
 * Tagli di crediti usati più spesso: restano come scorciatoie cliccabili,
 * ma il campo è libero perché un partner grosso può meritare cifre fuori scala.
 */
export const SCORCIATOIE_CREDITI = [100, 250, 500, 1000];

/** Limiti di sicurezza sui crediti regalati: 10.000 è già una cifra enorme da regalare. */
export const CREDITI_MIN = 0;
export const CREDITI_MAX = 10000;

/**
 * La colonna `expires_at` potrebbe non esistere ancora su questo database:
 * nessuna migration la crea. Invece di far fallire tutto il salvataggio,
 * riconosciamo l'errore "colonna sconosciuta" di PostgREST (PGRST204, oppure
 * il 42703 di Postgres, oppure il messaggio che cita il nome della colonna)
 * e riproviamo senza quel campo, avvisando l'admin in modo onesto.
 */
export function isErroreColonnaMancante(err: any, colonna: string): boolean {
  if (!err) return false;
  const codice = String(err.code || '');
  const testo = `${err.message || ''} ${err.details || ''} ${err.hint || ''}`.toLowerCase();
  if (codice === 'PGRST204' || codice === '42703') return true;
  return testo.includes(colonna.toLowerCase()) &&
    (testo.includes('column') || testo.includes('colonna') || testo.includes('schema cache'));
}

/** Testo unico dell'avviso, così form e lista dicono la stessa cosa. */
export const AVVISO_SCADENZA_ASSENTE =
  "La colonna expires_at non esiste ancora sul database: la scadenza NON è stata salvata (tutto il resto sì). Chiedi la migration prima di contare su questa funzione.";

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
  // Scadenza in formato YYYY-MM-DD (quello dell'input date). Vuoto = nessuna scadenza.
  const [newExpiresAt, setNewExpiresAt] = useState('');
  // Avviso persistente quando il DB non ha ancora la colonna expires_at.
  const [avvisoScadenza, setAvvisoScadenza] = useState(false);

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCouponCode || !newStructureName) {
      onMessage({ type: 'error', text: 'Compila tutti i campi richiesti!' });
      return;
    }

    const credits = parseInt(newRewardCredits, 10);
    const limitUses = parseInt(newMaxUses, 10);
    // Validazione prima della chiamata: un NaN qui diventerebbe un null sul DB
    // e un coupon che regala "niente" senza che nessuno se ne accorga.
    if (!Number.isFinite(credits) || credits < CREDITI_MIN || credits > CREDITI_MAX) {
      onMessage({ type: 'error', text: `I crediti regalo devono essere un numero fra ${CREDITI_MIN} e ${CREDITI_MAX}.` });
      return;
    }
    if (!Number.isFinite(limitUses) || limitUses < 1) {
      onMessage({ type: 'error', text: 'I riscatti massimi devono essere almeno 1.' });
      return;
    }

    setIsLoading(true);
    setAvvisoScadenza(false);
    try {
      const codeUpper = newCouponCode.trim().toUpperCase();

      const newCoupon: Record<string, any> = {
        code: codeUpper,
        structure_name: newStructureName,
        reward_credits: credits,
        duration_days: 0, // deprecato ma mantenuto per compatibilità DB temporanea
        max_uses: limitUses,
        uses_count: 0,
        is_active: true
      };

      // La scadenza vale per tutto il giorno scelto: chi riscatta alle 23:00
      // dell'ultimo giorno deve ancora riuscirci.
      const scadenzaIso = newExpiresAt ? new Date(`${newExpiresAt}T23:59:59`).toISOString() : null;

      let { error } = await supabase.from('coupons').upsert({ ...newCoupon, expires_at: scadenzaIso });
      if (error && isErroreColonnaMancante(error, 'expires_at')) {
        // Il DB non conosce ancora la scadenza: salviamo comunque il coupon
        // senza quel campo, perché perdere il coupon sarebbe peggio.
        const secondoTentativo = await supabase.from('coupons').upsert(newCoupon);
        error = secondoTentativo.error;
        if (!error && newExpiresAt) setAvvisoScadenza(true);
      }
      if (error) throw error;

      // Reset inputs
      setNewCouponCode('');
      setNewStructureName('');
      setNewMaxUses('50');
      setNewExpiresAt('');

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
            
            {avvisoScadenza && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-[11px] font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{AVVISO_SCADENZA_ASSENTE}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                <input
                  type="number"
                  min={CREDITI_MIN}
                  max={CREDITI_MAX}
                  step={10}
                  value={newRewardCredits}
                  onChange={e => setNewRewardCredits(e.target.value)}
                  className="w-full bg-white border-none rounded-xl p-3 text-xs font-bold"
                  required
                />
                {/* I vecchi 4 valori del menù a tendina restano a portata di clic:
                    servivano a evitare errori di battitura, non a limitare l'admin. */}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {SCORCIATOIE_CREDITI.map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setNewRewardCredits(String(v))}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-colors ${
                        newRewardCredits === String(v)
                          ? 'bg-primary text-white'
                          : 'bg-white text-primary/70 hover:bg-primary/10'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Riscatti Massimi</label>
                <input
                  type="number"
                  min={1}
                  value={newMaxUses}
                  onChange={e => setNewMaxUses(e.target.value)}
                  className="w-full bg-white border-none rounded-xl p-3 text-xs font-bold"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Scadenza (opzionale)</label>
                <input
                  type="date"
                  value={newExpiresAt}
                  onChange={e => setNewExpiresAt(e.target.value)}
                  className="w-full bg-white border-none rounded-xl p-3 text-xs font-bold"
                />
                <p className="text-[9px] text-primary/50 font-bold mt-1 leading-tight">Vuoto = nessuna scadenza. Vale fino a fine giornata.</p>
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
