import { X, Navigation, Trash2, MapPin, ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { motion, AnimatePresence, Reorder } from "motion/react";
import { useState, useMemo } from "react";
import { CATEGORY_COLORS, CATEGORY_EMOJIS } from "../lib/mapConstants";
import { Language } from "../lib/i18n";
import { tourService, MAX_TAPPE } from "../services/tourService";
import { useBozzaGiro } from "../lib/tour/useGiro";

/** "Ho un'ora": i tagli di tempo fra cui scegliere. `null` = tutto il giro. */
const TEMPI: { min: number | null; label: string }[] = [
  { min: 30, label: '30′' },
  { min: 60, label: '1 h' },
  { min: 90, label: '1 h 30' },
  { min: 120, label: '2 h' },
  { min: 180, label: '3 h' },
  { min: 240, label: '4 h' },
  { min: null, label: 'Tutto' },
];
import { puntoArrivo } from "../lib/puntoArrivo";

interface PoiRadarPanelProps {
  pois: any[];
  onClose: () => void;
  onFocus: (poi: any) => void;
  onRemove: (poiId: string) => void;
  language: Language;
}

export default function PoiRadarPanel({ pois, onClose, onFocus, onRemove, language }: PoiRadarPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // DIECI TAPPE. Il radar era una lista da guardare; con la selezione diventa
  // un giro da camminare. Il tetto e` dieci: un giro che si finisce vale piu`
  // di uno lungo abbandonato a meta`.
  // La selezione NON vive qui: sta nella bozza di tourService, che la mappa
  // legge e modifica con la X sui pin. Tenerla in questo stato voleva dire che
  // togliere una tappa dalla mappa non la toglieva dalla lista.
  const bozza = useBozzaGiro();
  const scelte = bozza.tappe;
  /** Le tappe nell'ordine in cui si cammineranno: e` l'ordine della lista trascinabile. */
  const sequenza = tourService.bozzaSequenza();
  const [creando, setCreando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const scegli = (poi: any) => {
    setErrore(null);
    if (!tourService.bozzaAlterna(poi)) setErrore('Giro pieno: dieci tappe al massimo.');
  };

  const creaGiro = async () => {
    setCreando(true); setErrore(null);
    try {
      await tourService.avviaDaBozza();
      // Il pre-scaricamento parte subito e non blocca: si cammina verso la
      // prima tappa mentre il resto arriva.
      tourService.prescarica().catch(() => {});
      window.dispatchEvent(new CustomEvent('wip-giro-avviato'));
      onClose();
    } catch (e: any) {
      const m = String(e?.message || '');
      setErrore(m.startsWith('PASS_RICHIESTO')
        ? 'Il giro a piu` tappe e` incluso nel Day Pass. Attivalo dal profilo per usarlo.'
        : m || 'Giro non riuscito.');
    } finally { setCreando(false); }
  };

  // La riga sotto il conteggio: prima diceva sempre la stessa frase; ora dice
  // il giro che ne esce — km e minuti — appena il server ha risposto.
  const distanza = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
  const rigaAnteprima = errore
    ? errore
    : bozza.calcolando
      ? 'Calcolo il percorso…'
      : bozza.errore === 'PASS_RICHIESTO'
        ? 'Anteprima del percorso col Day Pass: le tappe restano scelte.'
        : bozza.errore === 'POSIZIONE'
          ? 'Serve la posizione per disegnare il percorso da dove sei.'
          : bozza.metri > 0
            ? `${distanza(bozza.metri)} · ${bozza.minutiCammino} min a piedi · ad anello da dove sei`
            : 'WIP Nav mette le tappe nell’ordine che fa camminare meno';

  // 1. Deduplicazione rigorosa basata su nome o coordinate molto vicine
  const uniquePois = useMemo(() => {
    const seenNames = new Set<string>();
    const result: any[] = [];

    if (!Array.isArray(pois)) return result;

    pois.forEach(poi => {
      if (!poi || typeof poi.lat !== 'number' || typeof poi.lon !== 'number' || isNaN(poi.lat) || isNaN(poi.lon)) return;

      const name = (poi.nome || poi.name || "").toLowerCase().trim();
      const coordKey = `${poi.lat.toFixed(4)},${poi.lon.toFixed(4)}`;

      if (name && seenNames.has(name)) return;
      if (result.some(p => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}` === coordKey)) return;

      if (name) seenNames.add(name);
      result.push(poi);
    });

    return result;
  }, [pois]);

  const handleNavigate = async (poi: any) => {
    const { registerPlugin, Capacitor } = await import('@capacitor/core');
    // Verso la PORTA, non verso il centro dell'edificio: vedi puntoArrivo.
    const a = puntoArrivo(poi);
    if (Capacitor.isNativePlatform()) {
      const plugin = registerPlugin<any>('ItaintaBackgroundPoiPlugin');
      await plugin.openSystemNavigator({ lat: a.lat, lon: a.lon, name: poi.nome || poi.name });
    } else {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lon}`, '_blank');
    }
  };

  const handleItemClick = (poi: any) => {
    setFocusedId(poi.id);
    onFocus(poi);
  };

  return (
    <motion.div
      initial={{ y: "100%", opacity: 0 }}
      animate={{
        y: isCollapsed ? "calc(100% - 70px)" : "0%",
        opacity: 1
      }}
      exit={{ y: "100%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 250, damping: 30 }}
      className="absolute bottom-0 left-0 w-full md:left-6 md:bottom-6 md:w-[420px] max-h-[60dvh] bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-3xl shadow-2xl rounded-t-[2.5rem] md:rounded-[2rem] z-[1100] flex flex-col overflow-hidden border border-black/5"
    >
      {/* Header con tasto Riduzione/Espansione */}
      <div
        className="px-6 py-4 border-b border-black/5 flex items-center justify-between sticky top-0 z-10 bg-white/80 cursor-pointer"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
            {isCollapsed ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
          <div>
            <h2 className="text-lg font-black text-[#1e3a8a] tracking-tight leading-none">Radar Audioguida</h2>
            <p className="text-[9px] font-bold text-[#1e3a8a]/60 uppercase tracking-widest mt-1">
              {uniquePois.length} luoghi monitorati
            </p>
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="p-2 bg-black/5 hover:bg-black/10 rounded-full transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* La barra del giro: compare solo quando c'e` qualcosa da fare.
          Sta in ALTO e non in fondo alla lista, perche' con dieci tappe la
          lista scorre e il tasto sparirebbe proprio quando serve. */}
      {!isCollapsed && scelte.length > 0 && (
        <div className="px-4 py-3 border-b border-black/5 bg-blue-50/70 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-black text-[#1e3a8a] leading-tight">
              {scelte.length} {scelte.length === 1 ? 'tappa scelta' : 'tappe scelte'}
              {scelte.length >= MAX_TAPPE && <span className="font-bold text-[#1e3a8a]/50"> · massimo</span>}
            </p>
            <p className="text-[10px] text-[#1e3a8a]/60 leading-snug">
              {rigaAnteprima}
            </p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); tourService.bozzaSvuota(); setErrore(null); }}
            className="px-3 py-2 rounded-xl text-[11px] font-bold text-[#1e3a8a]/60 hover:bg-black/5 transition-colors shrink-0"
          >
            Annulla
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); creaGiro(); }}
            disabled={creando}
            className="px-4 py-2.5 rounded-xl bg-[#1e3a8a] text-white text-[12px] font-black shadow-md hover:bg-blue-800 transition-colors active:scale-95 disabled:opacity-60 shrink-0"
          >
            {creando
              ? 'Calcolo…'
              : (bozza.tappeNelTempo != null && bozza.tappeNelTempo < scelte.length)
                ? `Crea il giro (${bozza.tappeNelTempo})`
                : 'Crea il giro'}
          </button>
        </div>
      )}

      {/* Il tempo che hai e l'ordine delle tappe. Il tempo rovescia la
          domanda — non "quali dieci?" ma "quanto hai?" — e il giro si taglia
          alle tappe che ci stanno, cammino PIU` ascolto. L'ordine si trascina:
          WIP Nav fa camminare meno, ma "il museo chiude alle 18" lo sa solo
          chi cammina. */}
      {!isCollapsed && scelte.length > 0 && (
        <div className="px-4 py-2.5 border-b border-black/5 bg-white/70 space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[#1e3a8a]/50 mr-1">Tempo che hai</span>
            {TEMPI.map(({ min, label }) => (
              <button
                key={label}
                onClick={(e) => { e.stopPropagation(); tourService.bozzaImpostaTempo(min); }}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                  bozza.minutiDisponibili === min
                    ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]'
                    : 'bg-white text-[#1e3a8a]/70 border-black/10 hover:border-[#1e3a8a]/40'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {bozza.tappeNelTempo != null && bozza.tappeNelTempo < scelte.length && (
            <p className="text-[10px] text-amber-700 leading-snug">
              Nel tempo che hai ci {bozza.tappeNelTempo === 1 ? 'sta 1 tappa' : `stanno ${bozza.tappeNelTempo} tappe`} su {scelte.length}: le altre restano fuori dal giro.
            </p>
          )}

          {scelte.length >= 2 && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wide text-[#1e3a8a]/50">
                  Ordine del giro · trascina per cambiarlo
                </span>
                {bozza.ordineManuale && (
                  <button
                    onClick={(e) => { e.stopPropagation(); tourService.bozzaOrdineAutomatico(); }}
                    className="text-[10px] font-bold text-blue-600 hover:underline"
                  >
                    Riordina per me
                  </button>
                )}
              </div>
              <Reorder.Group
                axis="y"
                values={sequenza.map(t => String(t.id))}
                onReorder={(ids: string[]) => tourService.bozzaRiordina(ids)}
                className="space-y-1 list-none m-0 p-0"
              >
                {sequenza.map((t, i) => {
                  const fuori = bozza.tappeNelTempo != null && i >= bozza.tappeNelTempo;
                  return (
                    <Reorder.Item
                      key={String(t.id)}
                      value={String(t.id)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-xl bg-white border border-black/5 shadow-sm select-none ${fuori ? 'opacity-50' : ''}`}
                    >
                      <GripVertical className="w-3.5 h-3.5 text-black/30 cursor-grab shrink-0" />
                      <span className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 tabular-nums ${
                        fuori ? 'border border-dashed border-slate-400 text-slate-400' : 'bg-[#1e3a8a] text-white'
                      }`}>{i + 1}</span>
                      <span className="flex-1 min-w-0 text-[12px] font-bold text-[#1e3a8a] truncate">{t.nome}</span>
                      {fuori && <span className="text-[9px] font-bold uppercase text-slate-400 shrink-0">fuori tempo</span>}
                      <button
                        onClick={(e) => { e.stopPropagation(); tourService.bozzaTogli(t.id); }}
                        title="Togli dal giro"
                        className="w-6 h-6 rounded-full bg-red-50 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center shrink-0 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Reorder.Item>
                  );
                })}
              </Reorder.Group>
            </>
          )}
        </div>
      )}

      {/* Lista POI */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[250px] custom-scrollbar">
        <AnimatePresence initial={false}>
          {uniquePois.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-16 text-center opacity-40">
              <MapPin className="w-10 h-10 mb-3" />
              <p className="font-bold text-xs px-10 text-primary">Nessun POI attivo. Muoviti per trovarne di nuovi o controlla il Setup.</p>
            </motion.div>
          ) : (
            uniquePois.map((poi, idx) => {
              const isFocused = focusedId === poi.id;
              return (
                <motion.div
                  key={`${poi.id}-${idx}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all border ${
                    isFocused
                      ? 'bg-blue-50 border-blue-200 shadow-md ring-2 ring-blue-500/20'
                      : 'bg-white border-black/5 shadow-sm'
                  }`}
                  onClick={() => handleItemClick(poi)}
                >
                  <div className={`w-11 h-11 rounded-xl ${(CATEGORY_COLORS as any)[poi.category] || "bg-gray-100"} flex items-center justify-center text-xl shadow-sm cursor-pointer relative shrink-0 transition-transform ${isFocused ? 'scale-110' : ''}`}>
                    {(CATEGORY_EMOJIS as any)[poi.category] || "📍"}
                    {poi.isGem && <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-white rounded-full border border-amber-100 flex items-center justify-center text-[8px]">💎</div>}
                  </div>

                  <div className="flex-1 text-left min-w-0">
                    <h3 className={`font-black text-sm line-clamp-1 leading-tight ${isFocused ? 'text-blue-700' : 'text-[#1e3a8a]'}`}>
                      {poi.nome || poi.name}
                    </h3>
                    <p className="text-[9px] font-extrabold text-[#1e3a8a]/60 uppercase tracking-wider mt-0.5">{poi.poiType || poi.category}</p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* La spunta del giro. Il numero e` lo STESSO che sta sul
                        pin della mappa: l'ordine di cammino deciso dal motore
                        appena risponde, quello di scelta nel frattempo. */}
                    {(() => {
                      const dentro = tourService.bozzaHa(poi.id);
                      const pieno = !dentro && scelte.length >= MAX_TAPPE;
                      return (
                        <button
                          onClick={(e) => { e.stopPropagation(); scegli(poi); }}
                          disabled={pieno}
                          title={dentro ? 'Togli dal giro' : 'Aggiungi al giro'}
                          className={`w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black transition-all ${
                            dentro
                              ? 'bg-blue-600 text-white'
                              : pieno
                                ? 'bg-black/5 text-black/20'
                                : 'bg-blue-600/10 text-blue-600 hover:bg-blue-600 hover:text-white'
                          }`}
                        >
                          {dentro ? tourService.bozzaNumero(poi.id) : '+'}
                        </button>
                      );
                    })()}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleNavigate(poi); }}
                      className={`p-2 rounded-xl transition-all ${isFocused ? 'bg-blue-600 text-white' : 'bg-blue-600/10 text-blue-600 hover:bg-blue-600 hover:text-white'}`}
                    >
                      <Navigation className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Un POI tolto dal radar non puo` restare nel giro.
                        tourService.bozzaTogli(poi.id);
                        onRemove(poi.id);
                      }}
                      className="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
