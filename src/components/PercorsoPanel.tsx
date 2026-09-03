/**
 * PERCORSO SU MISURA — il pannello (03/09/2026).
 *
 * Committente: «una funzione che crea solo l'itinerario nella mappa con i
 * POI delle varie categorie: i POI si inseriscono direttamente dalla mappa,
 * WIP crea un percorso ottimizzato, se l'utente aggiunge o toglie un POI
 * ricalcola, e` a pagamento (30 crediti), solo percorso senza audioguide,
 * modificabile fino a 3 volte, con le opzioni "torna al punto di partenza"
 * e "finisci all'ultima tappa". Deve essere una funzione diversa
 * dall'audioguida ma usare sempre il navigatore WIP».
 *
 * Il pannello e` il fratello di PoiRadarPanel, ma piu` asciutto: niente
 * radar, niente tempo che hai (qui non c'e` ascolto da contare), niente
 * Day Pass. Le tappe si scelgono SOLO dalla mappa — il «+» compare su tutti
 * i pin delle chip accese — e qui si vedono in ordine di cammino, si
 * trascinano, si tolgono. Un solo tasto: «Crea e avvia», che paga e parte.
 * A percorso avviato il pannello mostra le tappe che restano, le modifiche
 * usate e la via d'uscita in auto (tutte le tappe in Google Maps).
 */
import { X, ChevronDown, ChevronUp, GripVertical, MapPin, Route, Car, Coins, Loader2, Flag } from "lucide-react";
import { motion, Reorder } from "motion/react";
import { useState } from "react";
import { CATEGORY_EMOJIS } from "../lib/mapConstants";
import { Language, getTranslation } from "../lib/i18n";
import { tourService, metri as metriFra } from "../services/tourService";
import { useBozzaGiro, useVistaGiro } from "../lib/tour/useGiro";
import { PRICING_LIST, CUSTOM_ROUTE_MAX_CHANGES } from "../lib/pricing";
import { navigaInAutoItinerario } from "./NavChoiceSheet";

interface Props {
  language: Language;
  onClose: () => void;
}

/** La posizione per il ricalcolo: GPS se risponde in fretta, altrimenti l'ultima nota. */
function conPosizione(fn: (p?: { lat: number; lon: number }) => void) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return fn();
  navigator.geolocation.getCurrentPosition(
    (p) => fn({ lat: p.coords.latitude, lon: p.coords.longitude }),
    () => fn(),
    { timeout: 4000, maximumAge: 15000 },
  );
}

export default function PercorsoPanel({ language, onClose }: Props) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const bozza = useBozzaGiro();
  const vista = useVistaGiro();
  const giro = tourService.datiGiro();
  const scelte = bozza.tappe;
  const sequenza = tourService.bozzaSequenza();
  const [creando, setCreando] = useState(false);
  const [errore, setErrore] = useState<{ tipo: 'crediti' | 'accesso' | 'modifiche' | 'altro'; testo: string } | null>(null);
  const tr = (k: string) => getTranslation(k, language);
  const costo = PRICING_LIST.custom_route;
  const tetto = tourService.bozzaTetto();
  const distanza = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

  /** Traduce i «no» del server nella riga giusta, con la sua via d'uscita. */
  const spiega = (e: any) => {
    const m = String(e?.message || '');
    if (m.startsWith('CREDITI_INSUFFICIENTI')) return setErrore({ tipo: 'crediti', testo: tr('pc_crediti_insufficienti').replace('{n}', String(costo)) });
    if (m === 'ACCESSO_RICHIESTO') return setErrore({ tipo: 'accesso', testo: tr('pc_accedi') });
    if (m.startsWith('MODIFICHE_ESAURITE')) return setErrore({ tipo: 'modifiche', testo: tr('pc_modifiche_esaurite').replace('{m}', String(CUSTOM_ROUTE_MAX_CHANGES)) });
    if (m === 'nessuna tappa') return setErrore(null);
    setErrore({ tipo: 'altro', testo: m || tr('gr_giro_non_riuscito') });
  };

  const crea = async () => {
    if (creando || scelte.length === 0) return;
    setCreando(true); setErrore(null);
    try {
      await tourService.avviaDaBozza();
      window.dispatchEvent(new CustomEvent('wip-giro-avviato'));
    } catch (e: any) {
      spiega(e);
    } finally { setCreando(false); }
  };

  const termina = () => {
    const ok = typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(tr('pc_termina_conferma')) : true;
    if (!ok) return;
    tourService.termina();
    setErrore(null);
  };

  const inCorsoPercorso = !!vista && !!giro && giro.modo === 'percorso';
  const inCorsoGiro = !!vista && !!giro && giro.modo !== 'percorso';

  // La riga sotto il conteggio: km e minuti appena il server ha risposto.
  const rigaAnteprima = bozza.calcolando
    ? tr('gr_calcolo_percorso')
    : bozza.errore === 'POSIZIONE'
      ? tr('gr_serve_posizione')
      : bozza.errore === 'ACCESSO_RICHIESTO'
        ? tr('pc_accedi')
        : bozza.metri > 0
          ? `${distanza(bozza.metri)} · ${bozza.minutiCammino} ${tr('gr_min_a_piedi')} · ${bozza.anello ? tr('gr_anello_da_dove_sei') : tr('gr_fino_ultima_tappa')}`
          : bozza.errore && bozza.errore !== 'PASS_RICHIESTO'
            ? bozza.errore
            : tr('gr_wipnav_ordina');

  return (
    <motion.div
      initial={{ y: "100%", opacity: 0 }}
      animate={{ y: isCollapsed ? "calc(100% - 70px)" : "0%", opacity: 1 }}
      exit={{ y: "100%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 250, damping: 30 }}
      className="absolute bottom-0 left-0 w-full md:left-6 md:bottom-6 md:w-[420px] max-h-[56dvh] md:max-h-[78dvh] bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-3xl shadow-2xl rounded-t-[2.5rem] md:rounded-[2rem] z-[1100] flex flex-col overflow-hidden border border-black/5"
    >
      <div
        className="px-6 py-4 border-b border-black/5 flex items-center justify-between sticky top-0 z-10 bg-white/80 cursor-pointer"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            {isCollapsed ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-black text-emerald-800 tracking-tight leading-none flex items-center gap-1.5">
              <Route className="w-4 h-4" /> {inCorsoPercorso ? tr('pc_in_corso') : tr('pc_titolo')}
            </h2>
            <p className="text-[9px] font-bold text-emerald-800/60 uppercase tracking-widest mt-1 truncate">
              {inCorsoPercorso && vista
                ? tr('pc_modifiche').replace('{n}', String(vista.modifiche)).replace('{m}', String(vista.modificheMax))
                : tr('pc_sottotitolo')}
            </p>
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="p-2 bg-black/5 hover:bg-black/10 rounded-full transition-colors shrink-0"
          aria-label={tr('gr_chiudi')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar">
        {/* C'e` un GIRO con audioguida in corso: le due funzioni non si
            mescolano. Si dice, e si rimanda al cruscotto per chiuderlo. */}
        {!isCollapsed && inCorsoGiro && (
          <div className="p-4">
            <p className="text-[12px] font-bold text-amber-800 bg-amber-50 rounded-xl px-3 py-2.5 leading-snug">
              {tr('gr_chiudi_giro_conferma')}
            </p>
          </div>
        )}

        {/* PERCORSO IN CORSO: le tappe che restano, le modifiche, l'auto, la fine. */}
        {!isCollapsed && inCorsoPercorso && giro && vista && (
          <div className="p-4 space-y-3 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
            <p className="text-[11px] text-emerald-900/70 leading-snug">{tr('pc_aggiungi_togli_hint')}</p>
            {errore && (
              <div className="px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-100 flex items-center gap-3">
                <p className="flex-1 text-[12px] font-bold text-amber-800 leading-snug">{errore.testo}</p>
                {errore.tipo === 'crediti' && (
                  <button onClick={() => window.dispatchEvent(new CustomEvent('wip-open-shop'))} className="px-3 py-2 rounded-xl bg-amber-400 text-slate-900 text-[11px] font-black shrink-0 flex items-center gap-1 active:scale-95">
                    <Coins className="w-3.5 h-3.5" /> {tr('gr_dp_ricarica_crediti')}
                  </button>
                )}
              </div>
            )}
            <div className="space-y-1">
              {giro.ordine.map((indice, posizione) => {
                const t = giro.tappe[indice];
                if (!t || t.esclusa) return null;
                const fatta = !!(t.fatta || t.saltata);
                const corrente = posizione === vista.tappaCorrente;
                // Numero assoluto, come il cruscotto e i pin (tourService.numeriTappe).
                const numero = tourService.numeriTappe().get(String(t.id)) ?? posizione + 1;
                return (
                  <div key={`${t.id}-${posizione}`} className={`flex items-center gap-2 px-2 py-1.5 rounded-xl bg-white border shadow-sm ${corrente ? 'border-emerald-300 ring-2 ring-emerald-500/20' : 'border-black/5'} ${fatta ? 'opacity-50' : ''}`}>
                    <span className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 tabular-nums ${fatta ? 'bg-slate-300 text-white' : corrente ? 'bg-emerald-700 text-white' : 'border border-emerald-700 text-emerald-700'}`}>
                      {fatta ? '✓' : numero}
                    </span>
                    <span className="text-base leading-none shrink-0">{(CATEGORY_EMOJIS as any)[t.categoria || ''] || '📍'}</span>
                    <span className="flex-1 min-w-0 text-[12px] font-bold text-emerald-900 truncate">{t.nome}</span>
                    {!fatta && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation(); setErrore(null);
                          conPosizione((p) => { tourService.escludi(t.id, p).catch(spiega); });
                        }}
                        title={tr('tour_togli_tappa')}
                        className="w-6 h-6 rounded-full bg-red-50 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center shrink-0 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-emerald-900/60 tabular-nums">
              {distanza(vista.metriRimanenti)} {tr('tour_mancanti')} <span className="text-black/20">·</span> {distanza(vista.metriTotali)} {tr('tour_totali')}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { const s = tourService.sequenzaPerNavigatore(); if (s) navigaInAutoItinerario(s); }}
                className="flex-1 px-3 py-2.5 rounded-xl bg-white border border-black/10 text-[11px] font-bold text-emerald-900 flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Car className="w-4 h-4" /> {tr('pc_in_auto')}
              </button>
              <button
                onClick={termina}
                className="px-3 py-2.5 rounded-xl bg-red-50 text-red-600 text-[11px] font-black flex items-center gap-1.5 active:scale-95 shrink-0"
              >
                <Flag className="w-4 h-4" /> {vista.stato === 'FINITO' ? tr('pc_nuovo') : tr('pc_termina')}
              </button>
            </div>
          </div>
        )}

        {/* LA COMPOSIZIONE: si sceglie dalla mappa, qui si vede cosa ne esce. */}
        {!isCollapsed && !vista && (
          <>
            <div className="px-4 py-3 border-b border-black/5 bg-emerald-50/90 backdrop-blur flex items-center gap-3 sticky top-0 z-10">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-black text-emerald-900 leading-tight">
                  {scelte.length === 0
                    ? tr('pc_titolo')
                    : scelte.length === 1 ? tr('pc_tappa_scelta') : tr('pc_tappe_scelte').replace('{n}', String(scelte.length))}
                  {scelte.length >= tetto && <span className="font-bold text-emerald-900/50"> · {tr('gr_massimo')}</span>}
                </p>
                <p className="text-[10px] text-emerald-900/60 leading-snug">
                  {scelte.length > 0 ? rigaAnteprima : tr('pc_prezzo_riga').replace('{n}', String(costo)).replace('{m}', String(CUSTOM_ROUTE_MAX_CHANGES))}
                </p>
              </div>
              {scelte.length > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); tourService.bozzaSvuota(); setErrore(null); }}
                  className="px-3 py-2 rounded-xl text-[11px] font-bold text-emerald-900/60 hover:bg-black/5 transition-colors shrink-0"
                >
                  {tr('gr_annulla')}
                </button>
              )}
              {scelte.length > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); crea(); }}
                  disabled={creando}
                  className="px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-[12px] font-black shadow-md hover:bg-emerald-800 transition-colors active:scale-95 disabled:opacity-60 shrink-0 flex items-center gap-1.5"
                >
                  {creando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Route className="w-4 h-4" />}
                  {creando ? tr('gr_calcolo') : scelte.length > 1 ? tr('pc_crea').replace('{n}', String(costo)) : tr('gr_avvia_navigazione')}
                </button>
              )}
            </div>

            {errore && (
              <div className="px-4 py-2.5 border-b border-black/5 bg-amber-50 flex items-center gap-3">
                <p className="flex-1 text-[12px] font-bold text-amber-800 leading-snug">{errore.testo}</p>
                {errore.tipo === 'crediti' && (
                  <button onClick={() => window.dispatchEvent(new CustomEvent('wip-open-shop'))} className="px-3 py-2 rounded-xl bg-amber-400 text-slate-900 text-[11px] font-black shrink-0 flex items-center gap-1 active:scale-95">
                    <Coins className="w-3.5 h-3.5" /> {tr('gr_dp_ricarica_crediti')}
                  </button>
                )}
                {errore.tipo === 'accesso' && (
                  <button onClick={() => window.dispatchEvent(new CustomEvent('wip-open-login'))} className="px-3 py-2 rounded-xl bg-[#1e3a8a] text-white text-[11px] font-black shrink-0 active:scale-95">
                    {tr('pc_accedi')}
                  </button>
                )}
              </div>
            )}

            {scelte.length === 0 ? (
              <div className="p-6 flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <MapPin className="w-7 h-7" />
                </div>
                <p className="text-[12px] text-emerald-900/70 leading-snug px-2">{tr('pc_vuoto')}</p>
                <p className="text-[11px] font-bold text-emerald-900/50">{tr('pc_prezzo_riga').replace('{n}', String(costo)).replace('{m}', String(CUSTOM_ROUTE_MAX_CHANGES))}</p>
              </div>
            ) : (
              <div className="px-4 py-2.5 space-y-2 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
                {/* Ad anello o aperto: le due opzioni chieste dal committente. */}
                <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-900/50 mr-1 shrink-0 whitespace-nowrap">{tr('gr_arrivo')}</span>
                  {([
                    { k: 'anello', anello: true, label: tr('gr_torno_da_dove_parto') },
                    { k: 'aperto', anello: false, label: tr('gr_finisco_ultima') },
                  ]).map(({ k, anello, label }) => (
                    <button
                      key={k}
                      onClick={(e) => { e.stopPropagation(); if (anello) tourService.impostaRientro('originale'); tourService.bozzaImpostaAnello(anello); }}
                      className={`px-2.5 py-1.5 min-h-8 rounded-full text-[11px] font-bold border transition-colors shrink-0 whitespace-nowrap ${
                        bozza.anello === anello ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-emerald-900/70 border-black/10 hover:border-emerald-700/40'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {scelte.length >= 2 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-900/50">{tr('gr_ordine_trascina')}</span>
                    {bozza.ordineManuale && (
                      <button onClick={(e) => { e.stopPropagation(); tourService.bozzaOrdineAutomatico(); }} className="text-[10px] font-bold text-emerald-700 hover:underline">
                        {tr('gr_riordina_per_me')}
                      </button>
                    )}
                  </div>
                )}
                <Reorder.Group
                  axis="y"
                  values={sequenza.map(t => String(t.id))}
                  onReorder={(ids: string[]) => tourService.bozzaRiordina(ids)}
                  className="space-y-1 list-none m-0 p-0"
                >
                  {sequenza.map((t, i) => (
                    <Reorder.Item
                      key={String(t.id)}
                      value={String(t.id)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-white border border-black/5 shadow-sm select-none"
                    >
                      <GripVertical className="w-3.5 h-3.5 text-black/30 cursor-grab shrink-0" />
                      <span className="w-5 h-5 rounded-full bg-emerald-700 text-white text-[10px] font-black flex items-center justify-center shrink-0 tabular-nums">{i + 1}</span>
                      <span className="text-base leading-none shrink-0">{(CATEGORY_EMOJIS as any)[t.categoria || ''] || '📍'}</span>
                      <span className="flex-1 min-w-0 text-[12px] font-bold text-emerald-900 truncate">{t.nome}</span>
                      {bozza.partenza && (
                        <span className="text-[9px] text-emerald-900/40 tabular-nums shrink-0">{distanza(metriFra(bozza.partenza, t.ingresso ?? { lat: t.lat, lon: t.lon }))}</span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); tourService.bozzaTogli(t.id); }}
                        title={tr('gr_togli_dal_giro')}
                        className="w-6 h-6 rounded-full bg-red-50 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center shrink-0 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
                {bozza.problemi.length > 0 && (
                  <p className="text-[10px] text-amber-700 leading-snug">{bozza.problemi.length} {tr('tour_problemi')}</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
