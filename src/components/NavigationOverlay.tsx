// =====================================================================
// ITAINTA · NavigationOverlay — overlay del navigatore pedonale
// Mostra istruzione corrente, distanza alla prossima svolta, distanza e
// tempo stimato alla destinazione, e il pulsante STOP.
// Si pilota con i valori restituiti da useWalkingNavigation.
// =====================================================================

import { createPortal } from 'react-dom';
import { Navigation2, Flag, Clock, X, Volume2 } from 'lucide-react';
import type { NavState } from '../hooks/useWalkingNavigation';
import { getTranslation, type Language } from '../lib/i18n';

interface NavigationOverlayProps {
  state: NavState;
  currentInstruction: string | null;
  distanceToNext: number | null;
  distanceToDestination: number | null;
  etaSeconds: number | null;
  poiName?: string;
  onStop: () => void;
  onNextStop?: () => void;
  /** Ripete a voce l'istruzione corrente. */
  onRepeat?: () => void;
  /** Lingua UI: l'overlay era l'unica schermata del cammino hardcoded in IT. */
  language?: Language;
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
  onRepeat,
  language = 'IT',
}: NavigationOverlayProps) {
  if (state === 'idle') return null;

  const arrived = state === 'arrived';
  const t = (k: string) => getTranslation(k, language);

  // Portal su body: il banner vive dentro il tab "plan", che riceve
  // display:none quando si apre la scheda POI (cambio tab automatico al
  // trigger audio) — un fixed dentro un antenato nascosto sparisce. Col
  // portal il banner resta visibile durante tutta la navigazione.
  return createPortal(
    <div className="fixed top-0 left-0 right-0 z-[1200] p-3 pointer-events-none">
      <div className="mx-auto max-w-md rounded-2xl bg-primary/95 text-secondary shadow-2xl pointer-events-auto border border-secondary/20 backdrop-blur-md">
        <div className="flex items-center gap-3 p-4">
          <div className="shrink-0 rounded-full bg-secondary text-primary p-2.5">
            {arrived ? <Flag size={22} /> : <Navigation2 size={22} />}
          </div>
          <div className="min-w-0 flex-1">
            {state === 'routing' && <p className="text-sm text-secondary/80">{t('nav_calculating')}</p>}
            {state === 'navigating' && (
              <>
                <p className="truncate text-base font-semibold">
                  {currentInstruction || t('nav_proceed')}
                </p>
                {distanceToNext != null && (
                  <p className="text-xs text-secondary/60">{t('nav_in')} {fmtMeters(distanceToNext)}</p>
                )}
              </>
            )}
            {arrived && (
              <div className="flex flex-col items-start gap-2">
                <p className="text-base font-semibold">{poiName ? `${t('nav_arrived_at')} ${poiName} 🎉` : `${t('nav_arrived')} 🎉`}</p>
                {onNextStop && (
                  <button
                    onClick={onNextStop}
                    className="mt-1 bg-secondary hover:bg-secondary/90 text-primary font-bold py-1.5 px-3 rounded-lg text-xs transition-colors"
                  >
                    {t('nav_next_stop')}
                  </button>
                )}
              </div>
            )}
          </div>
          {state === 'navigating' && onRepeat && (
            <button
              onClick={onRepeat}
              aria-label={t('nav_repeat')}
              className="shrink-0 rounded-full bg-white/10 p-2 hover:bg-white/20"
            >
              <Volume2 size={18} />
            </button>
          )}
          <button
            onClick={onStop}
            aria-label={t('nav_stop')}
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
    </div>,
    document.body
  );
}
