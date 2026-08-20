/**
 * DIECI TAPPE — il banner di controllo.
 *
 * Sta in basso e non copre la mappa: durante il giro la mappa E` la funzione,
 * il banner e` il cruscotto. Per lo stesso motivo mostra sempre i quattro
 * numeri che servono a decidere se continuare — tappe fatte, tappe totali,
 * metri percorsi, metri rimanenti — invece di nasconderli dietro un tocco.
 *
 * I comandi sono tre: pausa, riascolta, salta. Non di piu`: chi cammina con il
 * telefono in mano guarda lo schermo per un secondo, e in un secondo si
 * riconoscono tre bottoni, non sei.
 */
import { useEffect, useState } from 'react';
import { Pause, Play, RotateCcw, SkipForward, X, Navigation2 } from 'lucide-react';
import { tourService, type VistaGiro } from '../services/tourService';
import { Language, getTranslation } from '../lib/i18n';

interface Props {
  language: Language;
  /** L'istruzione corrente del navigatore, se ce n'e` una. */
  istruzione?: string | null;
  metriAllaSvolta?: number | null;
  onRiascolta?: () => void;
  onChiudi?: () => void;
}

export default function TourBanner({ language, istruzione, metriAllaSvolta, onRiascolta, onChiudi }: Props) {
  const [v, setV] = useState<VistaGiro | null>(tourService.vista());
  const [pausaManuale, setPausaManuale] = useState(false);

  useEffect(() => tourService.ascolta(setV), []);

  if (!v) return null;

  const percentuale = v.metriTotali > 0
    ? Math.max(0, Math.min(100, Math.round((1 - v.metriRimanenti / v.metriTotali) * 100)))
    : 0;

  const distanza = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

  return (
    <div className="fixed left-0 right-0 bottom-0 z-[9000] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pointer-events-none">
      <div className="mx-auto max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden pointer-events-auto">

        {/* Avanzamento: una riga sola, ma dice tutto a colpo d'occhio */}
        <div className="h-1 bg-gray-100">
          <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${percentuale}%` }} />
        </div>

        {/* L'istruzione corrente. In pausa non si mostra: sarebbe un sollecito */}
        {istruzione && !v.inPausa && (
          <div className="flex items-center gap-2.5 px-4 pt-3">
            <Navigation2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <p className="text-[13px] font-bold text-gray-900 leading-snug flex-1">{istruzione}</p>
            {metriAllaSvolta != null && (
              <span className="text-[11px] font-bold text-blue-600 tabular-nums flex-shrink-0">{distanza(metriAllaSvolta)}</span>
            )}
          </div>
        )}

        <div className="px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
              {getTranslation('tour_tappa', language)} {v.tappeFatte + 1} / {v.tappeTotali}
            </p>
            <p className="text-[14px] font-bold text-gray-900 truncate">
              {v.inPausa ? getTranslation('tour_in_pausa', language) : (v.nomeTappa || '—')}
            </p>
            <p className="text-[11px] text-gray-500 tabular-nums">
              {distanza(v.metriRimanenti)} {getTranslation('tour_mancanti', language)}
              <span className="text-gray-300"> · </span>
              {distanza(v.metriTotali)} {getTranslation('tour_totali', language)}
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => { const p = !pausaManuale; setPausaManuale(p); }}
              title={pausaManuale ? getTranslation('tour_riprendi', language) : getTranslation('tour_pausa', language)}
              className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors active:scale-95"
            >
              {pausaManuale ? <Play className="w-4 h-4 text-gray-700" /> : <Pause className="w-4 h-4 text-gray-700" />}
            </button>
            <button
              onClick={onRiascolta}
              title={getTranslation('tour_riascolta', language)}
              className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors active:scale-95"
            >
              <RotateCcw className="w-4 h-4 text-gray-700" />
            </button>
            <button
              onClick={() => {
                navigator.geolocation?.getCurrentPosition(
                  (p) => tourService.salta({ lat: p.coords.latitude, lon: p.coords.longitude }),
                  () => tourService.salta(),
                  { timeout: 4000 },
                );
              }}
              title={getTranslation('tour_salta', language)}
              className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors active:scale-95"
            >
              <SkipForward className="w-4 h-4 text-gray-700" />
            </button>
            <button
              onClick={() => { tourService.termina(); onChiudi?.(); }}
              title={getTranslation('tour_termina', language)}
              className="w-10 h-10 rounded-full bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors active:scale-95"
            >
              <X className="w-4 h-4 text-red-600" />
            </button>
          </div>
        </div>

        {/* Le tappe irraggiungibili si DICONO. Un errore silenzioso qui fa
            sembrare l'app rotta invece che onesta. */}
        {tourService.datiGiro()?.problemi?.length ? (
          <p className="px-4 pb-2.5 text-[10px] text-amber-700 bg-amber-50 py-1.5">
            {tourService.datiGiro()!.problemi.length} {getTranslation('tour_problemi', language)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
