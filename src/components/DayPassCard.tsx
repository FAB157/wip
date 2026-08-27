import { useEffect, useState } from 'react';
import { Loader2, Ticket } from 'lucide-react';
import { notify } from '../lib/toast';
import { getTranslation, linguaCorrente } from '../lib/i18n';
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
  const tr = (k: string) => getTranslation(k, linguaCorrente());

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
      tr('gr_dp_confirm')
        .replace('{costo}', String(DAY_PASS_COST))
        .replace('{cap}', String(DAY_PASS_CAP))
    )) return;
    setActivating(true);
    try {
      const state = await activateDayPass();
      setDayPass(state);
      notify(tr('gr_dp_attivo_notify'), 'success');
    } catch (e: any) {
      notify(e?.message || tr('gr_dp_attivazione_fallita'));
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
                {tr('gr_dp_stato_attivo')
                  .replace('{n}', String(Math.max(0, dayPass.cap - dayPass.used)))
                  .replace('{ora}', new Date(dayPass.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}
              </p>
            ) : (
              <p className="text-sm text-blue-100 mt-0.5">
                {tr('gr_dp_pitch').replace('{cap}', String(DAY_PASS_CAP))}
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
            {activating ? <Loader2 className="w-5 h-5 animate-spin" /> : tr('gr_dp_crediti').replace('{n}', String(DAY_PASS_COST))}
          </button>
        )}
      </div>
    </div>
  );
}
