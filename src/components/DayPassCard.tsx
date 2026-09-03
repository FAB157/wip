import { useEffect, useState } from 'react';
import { Loader2, Ticket, Coins } from 'lucide-react';
import { notify } from '../lib/toast';
import { getTranslation, linguaCorrente } from '../lib/i18n';
import { getWalletBalance, CREDITS_UPDATED_EVENT } from '../lib/pricing';
import { supabase } from '../lib/supabase';
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
 * il profilo (in primo piano, 03/09/2026) e come contenuto del
 * DayPassOfferModal.
 *
 * LA CASSA NON E` UN VICOLO CIECO (03/09/2026, collaudo). Il tasto diceva
 * «200 crediti» e, a saldo insufficiente, l'attivazione falliva con un
 * toast: chi voleva comprare non sapeva dove andare. Ora il tasto dice
 * «Acquista ora», e quando i crediti non bastano la card lo scrive («hai 40
 * crediti, te ne servono 200») e offre «Ricarica crediti», che porta al
 * negozio (evento `wip-open-shop`: App.tsx apre il profilo, ProfileScreen la
 * scheda dei pacchetti).
 */
export default function DayPassCard({ compact = false }: { compact?: boolean }) {
  const [dayPass, setDayPass] = useState<DayPassState | null>(null);
  const [activating, setActivating] = useState(false);
  /** Saldo, letto solo quando serve dirlo (fallimento per crediti). */
  const [saldo, setSaldo] = useState<number | null>(null);
  const [creditiPochi, setCreditiPochi] = useState(false);
  const tr = (k: string) => getTranslation(k, linguaCorrente());

  const refresh = () => {
    getDayPassState().then(setDayPass).catch(() => {});
  };

  useEffect(() => {
    refresh();
    window.addEventListener(DAY_PASS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(DAY_PASS_UPDATED_EVENT, refresh);
  }, []);

  // Dopo una ricarica il saldo cambia: se bastava, l'avviso sparisce da solo.
  useEffect(() => {
    if (!creditiPochi) return;
    const aggiorna = () => { leggiSaldo().then((s) => { if (s != null && s >= DAY_PASS_COST) setCreditiPochi(false); }); };
    window.addEventListener(CREDITS_UPDATED_EVENT, aggiorna);
    return () => window.removeEventListener(CREDITS_UPDATED_EVENT, aggiorna);
  }, [creditiPochi]);

  const leggiSaldo = async (): Promise<number | null> => {
    try {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id;
      if (!id) return null;
      const b = await getWalletBalance(id);
      const tot = Number((b as any)?.total);
      const v = Number.isFinite(tot) ? tot : null;
      setSaldo(v);
      return v;
    } catch { return null; }
  };

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
      setCreditiPochi(false);
      notify(tr('gr_dp_attivo_notify'), 'success');
    } catch (e: any) {
      const m = String(e?.message || '');
      // Il messaggio dei crediti insufficienti e` quello di dayPassService:
      // si riconosce dal testo tradotto, che e` l'unica cosa che arriva.
      const pochi = m === tr('gr_dp_crediti_insufficienti').replace('{n}', String(DAY_PASS_COST));
      if (pochi) { setCreditiPochi(true); void leggiSaldo(); }
      // Ospite: la cassa vuole un account. Si apre il login, non un toast muto.
      if (m === tr('gr_dp_accedi')) window.dispatchEvent(new CustomEvent('wip-open-login'));
      notify(m || tr('gr_dp_attivazione_fallita'));
    } finally {
      setActivating(false);
    }
  };

  const apriNegozio = () => {
    window.dispatchEvent(new CustomEvent('wip-open-shop'));
  };

  return (
    <div className={`bg-gradient-to-r from-blue-900 to-blue-700 text-white rounded-2xl ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Ticket className={`${compact ? 'w-5 h-5' : 'w-6 h-6'} mt-0.5 shrink-0`} />
          <div className="min-w-0">
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
            className="bg-white text-blue-900 font-bold px-4 py-2 rounded-xl shrink-0 hover:bg-blue-50 disabled:opacity-50 text-sm whitespace-nowrap"
          >
            {activating ? <Loader2 className="w-5 h-5 animate-spin" /> : tr('gr_dp_acquista_ora').replace('{n}', String(DAY_PASS_COST))}
          </button>
        )}
      </div>
      {/* Crediti che non bastano: si dice quanti mancano e si apre la strada
          per ricaricare. Prima qui c'era solo il toast dell'errore. */}
      {!dayPass?.active && creditiPochi && (
        <div className="mt-3 pt-3 border-t border-white/20 flex items-center gap-3">
          <p className="flex-1 text-[12px] text-blue-100 leading-snug">
            {saldo != null
              ? tr('gr_dp_saldo_non_basta').replace('{saldo}', String(saldo)).replace('{costo}', String(DAY_PASS_COST))
              : tr('gr_dp_crediti_insufficienti').replace('{n}', String(DAY_PASS_COST))}
          </p>
          <button
            onClick={apriNegozio}
            className="bg-amber-400 text-slate-900 font-black px-3 py-2 rounded-xl shrink-0 text-[12px] flex items-center gap-1.5 active:scale-95"
          >
            <Coins className="w-4 h-4" /> {tr('gr_dp_ricarica_crediti')}
          </button>
        </div>
      )}
    </div>
  );
}
