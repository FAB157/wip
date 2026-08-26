/**
 * Bottone + modalina "Aggiungi al calendario": esporta l'itinerario come
 * file .ics universale (Apple/Google/Outlook), un evento per tappa con
 * promemoria 30 minuti prima. Condiviso tra PlanScreen (itinerario appena
 * generato) e ProfileScreen (itinerari salvati).
 *
 * L'itinerario ha il MESE ma non le date esatte: la modalina chiede
 * "Quando inizia il viaggio?" con default il primo giorno utile
 * (defaultStart se futura, altrimenti domani).
 */
import React, { useState } from 'react';
import { X, CalendarPlus, Loader2 } from 'lucide-react';
import { buildItineraryIcs, deliverIcsFile } from '../lib/calendarExport';
import { notify } from '../lib/toast';
import { getTranslation, type Language } from '../lib/i18n';

interface CalendarExportButtonProps {
  /** Oggetto itinerario con giorni[].tappe[] (generatedPlan o dati_itinerario). */
  itinerary: any;
  /** Titolo di riserva se l'oggetto itinerario non ha `titolo`. */
  fallbackTitle?: string;
  /** Data di inizio proposta (es. primo giorno del mese scelto nel form). */
  defaultStart?: Date | null;
  /** Classi del bottone trigger (per adattarsi alle due toolbar). */
  buttonClassName?: string;
  /** Etichetta del bottone trigger. */
  buttonLabel?: string;
  /** Lingua UI (default IT: ProfileScreen non la passa ancora). */
  language?: Language | string;
  /** Coordinate della destinazione: servono a scegliere il fuso orario degli eventi. */
  destCoords?: { lat: number; lon: number } | null;
}

/** Domani a mezzanotte locale. */
function tomorrow(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d;
}

/** Date → valore per <input type="date"> (YYYY-MM-DD locale). */
function toInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function CalendarExportButton({
  itinerary,
  fallbackTitle,
  defaultStart,
  buttonClassName,
  buttonLabel,
  language = 'IT',
  destCoords,
}: CalendarExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [dateValue, setDateValue] = useState('');
  const [busy, setBusy] = useState(false);
  const lang = String(language || 'IT').toUpperCase() as Language;
  const t = (key: string) => getTranslation(`cal_${key}`, lang);

  const tappeCount = Array.isArray(itinerary?.giorni)
    ? itinerary.giorni.reduce((n: number, g: any) => n + (Array.isArray(g?.tappe) ? g.tappe.length : 0), 0)
    : 0;
  if (tappeCount === 0) return null;

  const openModal = () => {
    // Default: la data proposta se è nel futuro, altrimenti domani.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const proposed = defaultStart && defaultStart.getTime() > today.getTime()
      ? defaultStart
      : tomorrow();
    setDateValue(toInputValue(proposed));
    setOpen(true);
  };

  const handleExport = async () => {
    const start = dateValue ? new Date(`${dateValue}T00:00:00`) : tomorrow();
    if (isNaN(start.getTime())) { notify(t('invalid_date'), 'error'); return; }
    setBusy(true);
    try {
      const plan = (!itinerary?.titolo && fallbackTitle)
        ? { ...itinerary, titolo: fallbackTitle }
        : itinerary;
      const { filename, icsContent } = buildItineraryIcs(plan, start, { destCoords: destCoords || undefined });
      const ok = await deliverIcsFile(filename, icsContent);
      if (ok) {
        // Toast SOLO a consegna reale: deliverIcsFile torna false anche se
        // l'utente annulla la condivisione (AbortError).
        notify(t('ready'), 'success');
        setOpen(false);
      } else {
        notify(t('download_failed'), 'error');
      }
    } catch (e) {
      console.error('[CalendarExport] errore export ICS:', e);
      notify(t('export_error'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={buttonClassName || 'px-4 py-2 bg-white border border-outline-variant/10 text-primary rounded-2xl flex items-center gap-2 font-bold hover:bg-primary/5 transition-colors shadow-sm text-sm'}
        title={t('button_title')}
      >
        {buttonLabel || `📅 ${t('add_to_calendar')}`}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/50 p-4 print:hidden"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-[2rem] p-6 shadow-2xl space-y-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <CalendarPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900 leading-tight">{t('add_to_calendar')}</h3>
                  <p className="text-[11px] font-bold text-gray-500">{tappeCount} {t('stops')} · Apple, Google, Outlook</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                aria-label={getTranslation('close', lang)}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label htmlFor="wip-cal-start" className="text-[11px] font-black text-primary uppercase tracking-widest pl-1">
                {t('when_starts')}
              </label>
              <input
                id="wip-cal-start"
                type="date"
                value={dateValue}
                min={toInputValue(new Date())}
                onChange={e => setDateValue(e.target.value)}
                className="w-full p-3.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold text-gray-900 outline-none focus:border-primary/40"
              />
              <p className="text-[11px] text-gray-500 font-medium pl-1">
                {t('one_event_per_stop')}
              </p>
            </div>

            <button
              type="button"
              onClick={handleExport}
              disabled={busy || !dateValue}
              className="w-full py-3.5 bg-primary text-white font-black text-[12px] uppercase tracking-widest rounded-[1.25rem] hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />}
              {t('download_ics')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
