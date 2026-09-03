// =====================================================================
// ITAINTA · NavigationOverlay — overlay del navigatore pedonale "WIP Nav"
// Impaginato come un navigatore vero: freccia della manovra, distanza alla
// svolta in evidenza, istruzione per esteso, barra di avanzamento e piede
// con distanza/tempo/orario d'arrivo. Si pilota con useWalkingNavigation.
// =====================================================================

import { createPortal } from 'react-dom';
import {
  Flag, Clock, X, Volume2, Footprints, Navigation2, ArrowUp, ArrowUpLeft,
  ArrowUpRight, ArrowLeft, ArrowRight, CornerUpLeft, CornerUpRight,
  RotateCcw, RotateCw, RefreshCw, MapPin,
} from 'lucide-react';
import type { NavState, ManeuverInfo } from '../hooks/useWalkingNavigation';
import { getTranslation, type Language } from '../lib/i18n';

interface NavigationOverlayProps {
  state: NavState;
  currentInstruction: string | null;
  /** Manovra strutturata: decide QUALE freccia disegnare. */
  currentManeuver?: ManeuverInfo | null;
  distanceToNext: number | null;
  distanceToDestination: number | null;
  etaSeconds: number | null;
  /** Avanzamento 0..1 per la barra in cima. */
  progress?: number | null;
  poiName?: string;
  onStop: () => void;
  onNextStop?: () => void;
  /** Ripete a voce l'istruzione corrente. */
  onRepeat?: () => void;
  /**
   * (03/09/2026) «Ricalcola da qui»: la strada si rifa` dalla posizione
   * attuale verso la stessa meta. Per la tappa singola e` l'unico posto dove
   * metterlo (non c'e` un cruscotto sotto); per il giro c'e` anche nel
   * cruscotto, ma la card e` quella che si guarda camminando.
   */
  onRecalc?: () => void;
  /** Ricalcolo in corso: l'icona gira e il tasto non si ripreme. */
  recalcInCorso?: boolean;
  /** Lingua UI: l'overlay era l'unica schermata del cammino hardcoded in IT. */
  language?: Language;
  /**
   * (29/08/2026) Per il giro «Dieci Tappe»: niente X. Il committente vuole la
   * card sempre presente finche' il navigatore e' in corso; il giro si ferma
   * dal cruscotto, non da qui.
   */
  senzaChiudi?: boolean;
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

/** Orario stimato di arrivo (come nei navigatori): adesso + ETA. */
function fmtArrivalClock(sec: number | null, language: Language): string | null {
  if (sec == null) return null;
  const at = new Date(Date.now() + sec * 1000);
  try {
    return at.toLocaleTimeString(String(language || 'IT').toLowerCase(), {
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  }
}

/**
 * Icona direzionale della manovra. OSRM espone type + modifier: qui si
 * traducono nella freccia che l'utente si aspetta di vedere (prima c'era
 * sempre e comunque la stessa icona generica, inutile a colpo d'occhio).
 */
function maneuverIcon(m?: ManeuverInfo | null) {
  const type = (m?.type || '').toLowerCase();
  const mod = (m?.modifier || '').toLowerCase();

  if (type === 'arrive') return Flag;
  if (type === 'depart') return Footprints;
  if (type === 'reroute') return RefreshCw;
  if (type === 'roundabout' || type === 'rotary') return mod.includes('left') ? RotateCcw : RotateCw;
  if (mod === 'uturn') return RotateCcw;
  if (mod === 'sharp left') return ArrowLeft;
  if (mod === 'sharp right') return ArrowRight;
  if (mod === 'slight left') return ArrowUpLeft;
  if (mod === 'slight right') return ArrowUpRight;
  if (mod === 'left') return CornerUpLeft;
  if (mod === 'right') return CornerUpRight;
  if (mod === 'straight' || type === 'continue' || type === 'new name') return ArrowUp;
  return Navigation2;
}

export default function NavigationOverlay({
  state,
  currentInstruction,
  currentManeuver,
  distanceToNext,
  distanceToDestination,
  etaSeconds,
  progress,
  poiName,
  onStop,
  onNextStop,
  onRepeat,
  onRecalc,
  recalcInCorso = false,
  language = 'IT',
  senzaChiudi = false,
}: NavigationOverlayProps) {
  if (state === 'idle') return null;

  const arrived = state === 'arrived';
  const t = (k: string) => getTranslation(k, language);
  const Icon = maneuverIcon(arrived ? { type: 'arrive' } : currentManeuver);
  // Svolta imminente: la freccia pulsa piano, come nei navigatori.
  const imminent = state === 'navigating' && distanceToNext != null && distanceToNext <= 30;
  const pct = Math.round(Math.min(1, Math.max(0, progress ?? 0)) * 100);
  const arrivalClock = fmtArrivalClock(etaSeconds, language);

  // Portal su body: il banner vive dentro il tab "plan", che riceve
  // display:none quando si apre la scheda POI (cambio tab automatico al
  // trigger audio) — un fixed dentro un antenato nascosto sparisce. Col
  // portal il banner resta visibile durante tutta la navigazione.
  return createPortal(
    /* z-[2100] (29/08/2026, collaudo: «il banner del navigatore rimane
       dietro le chips»): le chips delle categorie stanno a z-[2000] e
       coprivano la svolta. Camminando, la svolta vale piu' dei filtri. */
    <div
      className="fixed top-0 left-0 right-0 z-[2100] px-3 pointer-events-none"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <div className="mx-auto max-w-md overflow-hidden rounded-[1.75rem] bg-primary text-white shadow-2xl ring-1 ring-white/10 pointer-events-auto">

        {/* Avanzamento sul percorso */}
        {!arrived && (
          <div className="h-1 w-full bg-white/15" role="presentation">
            <div
              className="h-full bg-secondary transition-[width] duration-700 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}

        {/* ── ARRIVATO ─────────────────────────────────────────────── */}
        {arrived ? (
          <div className="p-4">
            <div className="flex items-start gap-3.5">
              <div className="shrink-0 grid place-items-center w-14 h-14 rounded-2xl bg-secondary text-primary shadow-lg">
                <Flag size={26} strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-secondary">
                  {t('nav_arrived')}
                </p>
                {poiName && (
                  <p className="mt-1 text-lg font-black leading-tight text-white">{poiName}</p>
                )}
              </div>
              <button
                onClick={onStop}
                aria-label={t('nav_stop')}
                className="shrink-0 grid place-items-center w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 transition-all"
              >
                <X size={18} />
              </button>
            </div>
            {onNextStop && (
              <button
                onClick={onNextStop}
                className="mt-3 w-full rounded-2xl bg-secondary py-3 text-primary text-xs font-black uppercase tracking-widest shadow-md active:scale-[0.98] transition-transform"
              >
                {t('nav_next_stop')}
              </button>
            )}
          </div>
        ) : state === 'routing' ? (
          /* ── CALCOLO PERCORSO ───────────────────────────────────── */
          <div className="flex items-center gap-3.5 p-4">
            <div className="shrink-0 grid place-items-center w-14 h-14 rounded-2xl bg-white/10">
              <Navigation2 size={24} className="text-secondary motion-safe:animate-pulse" />
            </div>
            <p className="flex-1 text-sm font-bold text-white/80">{t('nav_calculating')}</p>
            <button
              onClick={onStop}
              aria-label={t('nav_stop')}
              className="shrink-0 grid place-items-center w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 transition-all"
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          /* ── IN NAVIGAZIONE ─────────────────────────────────────── */
          <>
            <div className="flex items-start gap-3.5 p-4 pb-3">
              {/* Freccia della manovra */}
              <div
                className={`shrink-0 grid place-items-center w-16 h-16 rounded-2xl bg-secondary text-primary shadow-lg ${
                  imminent ? 'motion-safe:animate-pulse' : ''
                }`}
              >
                <Icon size={32} strokeWidth={2.75} />
              </div>

              <div className="min-w-0 flex-1">
                {/* Distanza alla svolta: il numero che si guarda camminando */}
                <p className="text-3xl font-black leading-none tabular-nums text-secondary">
                  {distanceToNext != null ? fmtMeters(distanceToNext) : fmtMeters(distanceToDestination)}
                </p>
                <p className="mt-1.5 text-[15px] font-bold leading-snug text-white line-clamp-2">
                  {currentInstruction || t('nav_proceed')}
                </p>
              </div>

              <div className="shrink-0 flex flex-col gap-2">
                {!senzaChiudi && (
                  <button
                    onClick={onStop}
                    aria-label={t('nav_stop')}
                    className="grid place-items-center w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 transition-all"
                  >
                    <X size={18} />
                  </button>
                )}
                {onRepeat && (
                  <button
                    onClick={onRepeat}
                    aria-label={t('nav_repeat')}
                    className="grid place-items-center w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 transition-all"
                  >
                    <Volume2 size={17} />
                  </button>
                )}
                {onRecalc && (
                  <button
                    onClick={onRecalc}
                    disabled={recalcInCorso}
                    aria-label={t('tour_ricalcola')}
                    title={t('tour_ricalcola')}
                    className="grid place-items-center w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 transition-all disabled:opacity-60"
                  >
                    <RefreshCw size={17} className={recalcInCorso ? 'animate-spin' : ''} />
                  </button>
                )}
              </div>
            </div>

            {/* «Salta tappa» anche IN NAVIGAZIONE (ITI-04): una tappa chiusa,
                irraggiungibile o senza coordinate valide bloccava l'utente
                finche' non "arrivava" — il bottone esisteva solo in stato
                arrived. */}
            {onNextStop && (
              <div className="px-4 pb-3">
                <button
                  onClick={onNextStop}
                  className="w-full rounded-2xl bg-white/10 hover:bg-white/20 py-2 text-white text-[11px] font-black uppercase tracking-widest active:scale-[0.98] transition-transform"
                >
                  {t('nav_skip_stop')}
                </button>
              </div>
            )}

            {/* Piede: quanto manca alla meta, in tre numeri */}
            <div className="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-2.5 text-white/75">
              {poiName && (
                <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-bold">
                  <MapPin size={13} className="shrink-0 text-secondary" />
                  <span className="truncate">{poiName}</span>
                </span>
              )}
              <span className="ml-auto inline-flex shrink-0 items-center gap-3.5 text-[11px] font-bold tabular-nums">
                <span className="inline-flex items-center gap-1.5">
                  <Flag size={13} className="text-secondary" /> {fmtMeters(distanceToDestination)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock size={13} className="text-secondary" />
                  {fmtEta(etaSeconds)}
                  {arrivalClock && <span className="text-white/55">· {arrivalClock}</span>}
                </span>
              </span>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
