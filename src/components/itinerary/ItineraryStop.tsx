import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MapPin, Clock, Navigation, ChevronDown, ChevronUp,
  ExternalLink, Sparkles, X, ArrowUp, ArrowDown,
  Lock, Unlock, RotateCcw, Check
} from 'lucide-react';
import { getTranslation, Language } from '../../lib/i18n';
import { ensureAffiliateUrl } from '../../lib/affiliates';
import { locationService } from '../../services/locationService';

interface ItineraryStopProps {
  key?: React.Key;
  tappa: any;
  tIdx: number;
  gIdx: number;
  isLast: boolean;
  expanded: boolean;
  isLocked: boolean;
  language: Language;
  onToggleExpand: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onToggleLock: () => void;
  onReplace: () => void;
  onDelete: () => void;
  onSelectPoi?: (tappa: any) => void;
}

export default function ItineraryStop({
  tappa,
  tIdx,
  gIdx,
  isLast,
  expanded,
  isLocked,
  language,
  onToggleExpand,
  onMove,
  onToggleLock,
  onReplace,
  onDelete,
  onSelectPoi
}: ItineraryStopProps) {
  return (
    <div className="relative">
      {/* Dot on line */}
      <div className={`absolute -left-[27px] top-4 w-3 h-3 rounded-full border-2 border-[#f8f5f0] shadow-sm ${
        tappa.tipo === 'ristorante' ? 'bg-orange-400' : tappa.tipo === 'pausa' ? 'bg-blue-400' : 'bg-primary'
      }`}></div>

      <div className="bg-white p-6 rounded-[2rem] border border-outline-variant/10 shadow-sm relative group print:shadow-none print:border-gray-200 print:break-inside-avoid">
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-on-surface-variant/40 tracking-widest bg-gray-50 px-2.5 py-1 rounded-full border border-gray-100 uppercase">
              {tappa.ora} • {tappa.tipo}
            </span>
            {tappa.visited && (
              <span className="flex items-center gap-1 text-[10px] font-black text-green-600 bg-green-50 px-2.5 py-1 rounded-full border border-green-100 uppercase animate-in fade-in zoom-in duration-300">
                <Check className="w-3 h-3" /> Visitato
              </span>
            )}
            {tappa.verifica === 'verificata' && (
              <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 uppercase" title="Tappa confermata dalla verifica AI incrociata">
                <Check className="w-3 h-3" /> Verificata
              </span>
            )}
            {(tappa.verifica === 'da_verificare' || tappa.verifica === 'non_conforme') && (
              <span className="flex items-center gap-1 text-[10px] font-black text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100 uppercase" title={tappa.nota_verifica || ''}>
                ⚠ Da verificare
              </span>
            )}
          </div>
          <div className="flex gap-1 transition-opacity print:hidden">
            <button
              onClick={() => onMove('up')}
              disabled={tIdx === 0}
              className="p-2 bg-gray-50 text-on-surface-variant/40 hover:text-secondary disabled:opacity-30 disabled:cursor-not-allowed rounded-full transition-colors"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onMove('down')}
              disabled={isLast}
              className="p-2 bg-gray-50 text-on-surface-variant/40 hover:text-secondary disabled:opacity-30 disabled:cursor-not-allowed rounded-full transition-colors"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onToggleLock}
              className={`p-2 rounded-full transition-colors ${isLocked ? 'bg-secondary/10 text-secondary' : 'bg-gray-50 text-on-surface-variant/40 hover:text-secondary'}`}
            >
              {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onReplace}
              className="p-2 bg-gray-50 text-on-surface-variant/40 hover:text-secondary rounded-full transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="p-2 bg-gray-50 text-on-surface-variant/40 hover:text-red-500 rounded-full transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div
          className="flex items-start justify-between gap-2 mb-2 cursor-pointer"
          onClick={onToggleExpand}
        >
          <div className="flex items-start gap-2 pr-2">
            <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <h4 className="font-black text-primary text-lg leading-tight">{tappa.titolo_tappa}</h4>
          </div>
          <button className="text-on-surface-variant/50 hover:text-primary transition-colors p-1 shrink-0 mt-0.5 print:hidden">
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden print:hidden"
            >
              <div className="pt-2 pb-1">
                {tappa.tempo_necessario && (
                  <div className="flex items-center gap-2 mb-3 text-xs font-black text-secondary/80 bg-secondary/10 px-3 py-1.5 rounded-xl w-fit">
                    <Clock className="w-3.5 h-3.5" />
                    {getTranslation("time_expected", language)}: {tappa.tempo_necessario}
                  </div>
                )}
                {tappa.spostamento_precedente && tappa.spostamento_precedente !== "null" && (
                  <div className="flex items-center gap-2 mb-3 text-xs font-black text-blue-600/80 bg-blue-50 px-3 py-1.5 rounded-xl w-fit">
                    <Navigation className="w-3.5 h-3.5" />
                    {getTranslation("movement", language)}: {tappa.spostamento_precedente}
                  </div>
                )}
                <p className="text-sm text-on-surface-variant font-bold leading-relaxed mb-4">{tappa.attivita}</p>

                {tappa.nota_verifica && (
                  <div className="mb-3 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-3 py-2 rounded-xl">
                    {tappa.nota_verifica}
                  </div>
                )}
                {tappa.fonte && (
                  <div className="mb-3 text-[10px] font-bold italic text-on-surface-variant/60">
                    Fonte: {tappa.fonte}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 items-center mb-4">
                  {(tappa.coordinate?.lat && (tappa.coordinate?.lng || (tappa.coordinate as any)?.lon)) ? (
                    <>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${tappa.coordinate.lat},${tappa.coordinate.lng || (tappa.coordinate as any).lon}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2 text-[10px] font-mono font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-xl border border-blue-100 shrink-0 transition-colors"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        Maps
                      </a>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // startCoords: ultima posizione GPS nota, se c'è; il
                          // modal sa comunque acquisire il GPS o accettare un
                          // indirizzo personalizzato come partenza.
                          const last = locationService.getLastLocation();
                          window.dispatchEvent(new CustomEvent('wip-smart-navigate', {
                            detail: {
                              destinationName: tappa.titolo_tappa,
                              startCoords: last ? { lat: last.latitude, lon: last.longitude } : null,
                              endCoords: { lat: tappa.coordinate.lat, lon: tappa.coordinate.lng || (tappa.coordinate as any).lon }
                            }
                          }));
                        }}
                        title={language === 'IT'
                          ? 'WIP Nav: il navigatore integrato dell\'app — ti guida lungo il percorso e fa partire da sole le audioguide dei luoghi che incontri (a differenza di Google Maps, pensato solo per portarti a destinazione).'
                          : 'WIP Nav: the app\'s built-in navigator — it guides you along the route and auto-plays the audio guides of places you pass (unlike Google Maps, which only gets you to your destination).'}
                        className="flex items-center gap-2 text-[10px] font-black uppercase text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-xl border border-indigo-100 transition-colors"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        WIP Nav
                      </button>
                    </>
                  ) : null}

                  {onSelectPoi && (
                    <button
                      onClick={() => onSelectPoi(tappa)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95"
                    >
                      <MapPin className="w-3.5 h-3.5" /> {getTranslation("details_offline", language)}
                    </button>
                  )}

                  {(tappa.link_info || (tappa as any).url) && (
                    <a
                      href={ensureAffiliateUrl(tappa.link_info || (tappa as any).url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-2 text-[10px] font-black uppercase text-white bg-[#FF5100] hover:bg-[#E04700] px-3 py-2 rounded-xl shrink-0 transition-colors shadow-sm"
                    >
                      🎟️ Acquista / Vedi Tour
                    </a>
                  )}
                </div>

                <div className="p-4 bg-[#f8f5f0] rounded-2xl border border-primary/5 flex gap-3 items-start mt-2">
                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0 shadow-sm border border-primary/10">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] text-primary/70 font-bold italic leading-relaxed pt-1.5">
                      "{tappa.consiglio_guida}"
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
