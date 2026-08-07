import { useEffect, useState } from 'react';
import { Loader2, Ticket } from 'lucide-react';
import {
  getDayPassState,
  activateDayPass,
  DAY_PASS_COST,
  DAY_PASS_CAP,
  DayPassState,
  DAY_PASS_UPDATED_EVENT,
} from '../services/dayPassService';

/**
 * Card riusabile del WIP Day Pass: stato (attivo/countdown) + acquisto.
 * Montata nei punti strategici: Mappe Offline, Itinerari (PlanScreen),
 * e come contenuto del DayPassOfferModal.
 */
export default function DayPassCard({ compact = false }: { compact?: boolean }) {
  const [dayPass, setDayPass] = useState<DayPassState | null>(null);
  const [activating, setActivating] = useState(false);

  const refresh = () => {
    getDayPassState().then(setDayPass).catch(() => {});
  };

  useEffect(() => {
    refresh();
    window.addEventListener(DAY_PASS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(DAY_PASS_UPDATED_EVENT, refresh);
  }, []);

  const handleActivate = async () => {
    if (!confirm(
      `Attivare il WIP Day Pass?\n\n${DAY_PASS_COST} crediti — per 24 ore l'audioguida completa ` +
      `parte da sola quando ti avvicini a un luogo (fino a ${DAY_PASS_CAP} guide), anche offline e a schermo spento. ` +
      'Metti le cuffie e basta.'
    )) return;
    setActivating(true);
    try {
      const state = await activateDayPass();
      setDayPass(state);
      alert('Day Pass attivo! Per 24 ore non devi fare più nulla: solo attivare le cuffie.');
    } catch (e: any) {
      alert(e?.message || 'Attivazione non riuscita.');
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className={`bg-gradient-to-r from-blue-900 to-blue-700 text-white rounded-2xl ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Ticket className={`${compact ? 'w-5 h-5' : 'w-6 h-6'} mt-0.5 shrink-0`} />
          <div>
            <h3 className="font-bold">WIP Day Pass</h3>
            {dayPass?.active ? (
              <p className="text-sm text-blue-100 mt-0.5">
                Attivo — {Math.max(0, dayPass.cap - dayPass.used)} guide rimaste,
                scade alle {new Date(dayPass.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            ) : (
              <p className="text-sm text-blue-100 mt-0.5">
                24 ore hands-free: avviso, teaser e audioguida completa automatici
                (fino a {DAY_PASS_CAP} guide), anche offline e a schermo spento.
              </p>
            )}
          </div>
        </div>
        {!dayPass?.active && (
          <button
            onClick={handleActivate}
            disabled={activating}
            className="bg-white text-blue-900 font-bold px-4 py-2 rounded-xl shrink-0 hover:bg-blue-50 disabled:opacity-50"
          >
            {activating ? <Loader2 className="w-5 h-5 animate-spin" /> : `${DAY_PASS_COST} crediti`}
          </button>
        )}
      </div>
    </div>
  );
}
