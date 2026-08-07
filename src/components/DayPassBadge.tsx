import { useEffect, useState } from 'react';
import { getDayPassState, DayPassState, DAY_PASS_UPDATED_EVENT } from '../services/dayPassService';

/**
 * Badge compatto "🎫 N" accanto al tasto cuffie: guide rimaste del Day Pass.
 * Visibile solo con pass attivo. Si aggiorna a ogni fine ascolto (eventi
 * teaser/audioguida), a ogni variazione del pass e con un polling di cortesia
 * ogni 30 s (gli ascolti in background incrementano il contatore nativo
 * senza passare dal JS).
 */
export default function DayPassBadge() {
  const [pass, setPass] = useState<DayPassState | null>(null);

  useEffect(() => {
    const refresh = () => { getDayPassState().then(setPass).catch(() => {}); };
    refresh();
    const interval = setInterval(refresh, 30000);
    window.addEventListener(DAY_PASS_UPDATED_EVENT, refresh);
    window.addEventListener('wip-teaser-finished', refresh);
    window.addEventListener('audioguide-status', refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener(DAY_PASS_UPDATED_EVENT, refresh);
      window.removeEventListener('wip-teaser-finished', refresh);
      window.removeEventListener('audioguide-status', refresh);
    };
  }, []);

  if (!pass?.active) return null;

  return (
    <div
      className="h-8 px-2.5 bg-blue-900/90 text-white rounded-full flex items-center gap-1 shadow-lg border border-white/20 text-xs font-black shrink-0"
      title={`Day Pass attivo: ${Math.max(0, pass.cap - pass.used)} guide rimaste`}
    >
      🎫 {Math.max(0, pass.cap - pass.used)}
    </div>
  );
}
