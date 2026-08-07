// =====================================================================
// ITAINTA · NavigationOverlay — overlay del navigatore pedonale
// Mostra istruzione corrente, distanza alla prossima svolta, distanza e
// tempo stimato alla destinazione, e il pulsante STOP.
// Si pilota con i valori restituiti da useWalkingNavigation.
// =====================================================================

import { Navigation2, Flag, Clock, X } from 'lucide-react';
import type { NavState } from '../hooks/useWalkingNavigation';

interface NavigationOverlayProps {
  state: NavState;
  currentInstruction: string | null;
  distanceToNext: number | null;
  distanceToDestination: number | null;
  etaSeconds: number | null;
  poiName?: string;
  onStop: () => void;
  onNextStop?: () => void;
}

function fmtMeters(m: number | null): string {
  if (m == null) return '—';
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

function fmtEta(sec: number | null): string {
  if (sec == null) return '—';
  const min = Math.round(sec / 60);
  return min < 1 ? '<1 min' : `${min} min`;
}

export default function NavigationOverlay({
  state,
  currentInstruction,
  distanceToNext,
  distanceToDestination,
  etaSeconds,
  poiName,
  onStop,
  onNextStop,
}: NavigationOverlayProps) {
  if (state === 'idle') return null;

  const arrived = state === 'arrived';

  return (
    <div className="fixed top-0 left-0 right-0 z-[1200] p-3 pointer-events-none">
      <div className="mx-auto max-w-md rounded-2xl bg-primary/95 text-secondary shadow-2xl pointer-events-auto border border-secondary/20 backdrop-blur-md">
        <div className="flex items-center gap-3 p-4">
          <div className="shrink-0 rounded-full bg-secondary text-primary p-2.5">
            {arrived ? <Flag size={22} /> : <Navigation2 size={22} />}
          </div>
          <div className="min-w-0 flex-1">
            {state === 'routing' && <p className="text-sm text-secondary/80">Calcolo del percorso…</p>}
            {state === 'navigating' && (
              <>
                <p className="truncate text-base font-semibold">
                  {currentInstruction || 'Procedi'}
                </p>
                {distanceToNext != null && (
                  <p className="text-xs text-secondary/60">tra {fmtMeters(distanceToNext)}</p>
                )}
              </>
            )}
            {arrived && (
              <div className="flex flex-col items-start gap-2">
                <p className="text-base font-semibold">Sei arrivato{poiName ? ` a ${poiName}` : ''} 🎉</p>
                {onNextStop && (
                  <button
                    onClick={onNextStop}
                    className="mt-1 bg-secondary hover:bg-secondary/90 text-primary font-bold py-1.5 px-3 rounded-lg text-xs transition-colors"
                  >
                    Vai alla prossima tappa
                  </button>
                )}
              </div>
            )}
          </div>
          <button
            onClick={onStop}
            aria-label="Ferma navigazione"
            className="shrink-0 rounded-full bg-white/10 p-2 hover:bg-white/20"
          >
            <X size={18} />
          </button>
        </div>

        {state === 'navigating' && (
          <div className="flex items-center justify-between border-t border-secondary/20 px-4 py-2 text-xs text-secondary/80">
            <span className="inline-flex items-center gap-1">
              <Flag size={13} /> {fmtMeters(distanceToDestination)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock size={13} /> {fmtEta(etaSeconds)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
