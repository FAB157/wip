import { useEffect, useState } from 'react';
import { getDayPassState, DayPassState, DAY_PASS_UPDATED_EVENT } from '../services/dayPassService';
import { getTranslation, linguaCorrente } from '../lib/i18n';

/**
 * Badge compatto "🎫 N" accanto al tasto cuffie: guide rimaste del Day Pass.
 * Visibile solo con pass attivo. Si aggiorna a ogni fine ascolto (eventi
 * teaser/audioguida), a ogni variazione del pass e con un polling di cortesia
 * ogni 30 s (gli ascolti in background incrementano il contatore nativo
 * senza passare dal JS).
 */
export default function DayPassBadge() {
  const [pass, setPass] = useState<DayPassState | null>(null);

  // (23/09/2026, batteria, voce 19) Il polling di 30 s girava per tutta la
  // sessione a cuffie accese, anche SENZA pass (il caso comune: 2 richieste
  // HTTPS ogni 30 s per un badge che non si vede) e a pagina nascosta. Serve
  // solo a pass ATTIVO, l'unico caso in cui il contatore nativo cambia senza
  // passare dal JS; senza pass bastano gli eventi e il ritorno in primo piano.
  const passAttivo = !!pass?.active;

  useEffect(() => {
    const refresh = () => { getDayPassState().then(setPass).catch(() => {}); };
    refresh();
    const alRitorno = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener(DAY_PASS_UPDATED_EVENT, refresh);
    window.addEventListener('wip-teaser-finished', refresh);
    window.addEventListener('audioguide-status', refresh);
    document.addEventListener('visibilitychange', alRitorno);
    return () => {
      window.removeEventListener(DAY_PASS_UPDATED_EVENT, refresh);
      window.removeEventListener('wip-teaser-finished', refresh);
      window.removeEventListener('audioguide-status', refresh);
      document.removeEventListener('visibilitychange', alRitorno);
    };
  }, []);

  useEffect(() => {
    if (!passAttivo) return;
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      getDayPassState().then(setPass).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [passAttivo]);

  if (!pass?.active) return null;

  return (
    <div
      className="h-8 px-2.5 bg-blue-900/90 text-white rounded-full flex items-center gap-1 shadow-lg border border-white/20 text-xs font-black shrink-0"
      title={getTranslation('gr_dp_badge_title', linguaCorrente()).replace('{n}', String(Math.max(0, pass.cap - pass.used)))}
    >
      🎫 {Math.max(0, pass.cap - pass.used)}
    </div>
  );
}
