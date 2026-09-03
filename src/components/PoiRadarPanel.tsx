import { X, Navigation, Trash2, MapPin, ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { motion, AnimatePresence, Reorder } from "motion/react";
import { useState, useMemo, useEffect } from "react";
import { CATEGORY_COLORS, CATEGORY_EMOJIS } from "../lib/mapConstants";
import { Language, getTranslation } from "../lib/i18n";
import { tourService, MAX_TAPPE, metri as metriFra } from "../services/tourService";
import { getGuideCharacter } from "../lib/guideSettings";
import { useBozzaGiro } from "../lib/tour/useGiro";
import { getDayPassState } from "../services/dayPassService";
import { gestisciErroreGiro } from "../lib/tour/passRichiesto";

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
import NavChoiceSheet from "./NavChoiceSheet";

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
  /** Lungo il corridoio, meno quelle gia` scelte nel frattempo. */
  const lungoLaStrada = bozza.lungoLaStrada.filter(p => !tourService.bozzaHa(p.id));
  const [creando, setCreando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const tr = (k: string) => getTranslation(k, language);

  const scegli = (poi: any) => {
    setErrore(null);
    if (!tourService.bozzaAlterna(poi)) setErrore(tr('gr_giro_pieno'));
  };

  const creaGiro = async () => {
    setCreando(true); setErrore(null);
    try {
      await tourService.avviaDaBozza();
      // Il pre-scaricamento parte subito e non blocca: si cammina verso la
      // prima tappa mentre il resto arriva. Lingua e personaggio dell'utente,
      // non 'it' fisso: l'esito si legge nel banner del giro.
      tourService.prescarica(undefined, String(language || 'IT').toLowerCase(), getGuideCharacter()).catch(() => {});
      window.dispatchEvent(new CustomEvent('wip-giro-avviato'));
      onClose();
    } catch (e: any) {
      // Il "motivo" del server (dopo i due punti) prima si scartava
      // (29/08/2026). Dal 03/09/2026 il 402 apre anche la cassa del Day Pass
      // con «Acquista ora»: la riga qui sotto resta per chi la chiude.
      const prima = scelte[0] as any;
      setErrore(gestisciErroreGiro(e, language, { toast: false, city: prima?.city || prima?.citta }));
    } finally { setCreando(false); }
  };

  // La riga sotto il conteggio: prima diceva sempre la stessa frase; ora dice
  // il giro che ne esce — km e minuti — appena il server ha risposto.
  const passRichiesto = (!!errore && errore.startsWith(tr('gr_pass_richiesto'))) || bozza.errore === 'PASS_RICHIESTO';
  // IL PASS CE L'HO, MA IL PANNELLO DICE DI ATTIVARLO (28/08/2026, collaudo).
  // Il 402 del server arriva anche quando la VERIFICA fallisce, non solo
  // quando il pass manca; e il pannello lo traduceva sempre in «attiva il
  // Day Pass», a chi lo aveva appena pagato. Si guarda lo stato locale del
  // pass: se e` attivo, il messaggio dice la verita` — non riconosciuto, non
  // assente — e offre «Riprova» invece di una seconda cassa.
  const [passLocale, setPassLocale] = useState<boolean | null>(null);
  useEffect(() => {
    if (!passRichiesto) return;
    let vivo = true;
    getDayPassState().then(s => { if (vivo) setPassLocale(!!s?.active); }).catch(() => { if (vivo) setPassLocale(false); });
    return () => { vivo = false; };
  }, [passRichiesto]);
  const distanza = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
  // PERCORSO APERTO: dove si finisce, DETTO PRIMA (28/08/2026). Il giro aperto
  // ottimizza una cosa sola — camminare il meno possibile per fare tutte le
  // tappe — e il capolinea puo` quindi restare a chilometri da dove si e`
  // partiti. E` un esito voluto, non un problema: si dice e basta, senza
  // allarmi e senza colori d'allerta, per non scoprirlo da stanchi.
  const distanzaDalRientro = (() => {
    if (bozza.anello || !bozza.partenza || sequenza.length === 0) return null;
    const ultima = sequenza[sequenza.length - 1];
    const p = ultima.ingresso ?? { lat: ultima.lat, lon: ultima.lon };
    const d = metriFra({ lat: bozza.partenza.lat, lon: bozza.partenza.lon }, p);
    // Sotto i 300 m «finisci a 120 m dalla partenza» e` rumore.
    return d >= 300 ? d : null;
  })();
  /**
   * QUANDO SPIEGA UN GUASTO, SI DEVE LEGGERE (28/08/2026). La riga sotto il
   * conteggio nasce come informazione di servizio (km · minuti · anello) e
   * quello stile — 10px al 60% — le va bene. Ma la stessa riga porta anche
   * l'unico messaggio che dice PERCHE' il percorso non c'e`: il Day Pass
   * mancante, la posizione assente, la rete. Un utente ha creato un giro e ha
   * visto una retta grigia senza capire il motivo, che li` sotto c'era. Come
   * errore la riga passa a 12px e pieno contrasto; come informazione resta
   * com'era.
   */
  const anteprimaEErrore = !!errore || (!bozza.calcolando && !!bozza.errore);
  const rigaAnteprima = errore
    ? errore
    : bozza.calcolando
      ? tr('gr_calcolo_percorso')
      : bozza.errore === 'PASS_RICHIESTO'
        ? (bozza.erroreDettaglio ? `${tr('gr_anteprima_pass')} (${bozza.erroreDettaglio})` : tr('gr_anteprima_pass'))
        : bozza.errore === 'POSIZIONE'
          ? tr('gr_serve_posizione')
          : bozza.metri > 0
            ? `${distanza(bozza.metri)} · ${bozza.minutiCammino} ${tr('gr_min_a_piedi')} · ${bozza.anello ? tr('gr_anello_da_dove_sei') : tr('gr_fino_ultima_tappa')}${distanzaDalRientro != null ? ` · ${tr('gr_finisci_a_distanza').replace('{d}', distanza(distanzaDalRientro))}` : ''}`
            : tr('gr_wipnav_ordina');

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

  // Doppia scelta (22/08/2026): 🚶 WIP Nav o 🚗 Google Maps / Mappe, come
  // negli itinerari. NavChoiceSheet punta alla porta (puntoArrivo) e gestisce
  // il plugin nativo col ripiego sul link web.
  const [navPoi, setNavPoi] = useState<any | null>(null);
  // IN AUTO SI FA TUTTO IL GIRO (01/09/2026, committente). Dal radar l'auto
  // dava indicazioni verso una tappa sola: guidando vuol dire ripartire da capo
  // a ogni fermata. Con un giro di piu` tappe — in corso o ancora in bozza —
  // l'auto consegna a Google Maps l'intera sequenza, esattamente come quando
  // si sceglie «in auto» dall'itinerario. A piedi non cambia niente: resta la
  // navigazione gratis verso QUESTA tappa (la regola dei due tasti).
  // La sequenza si legge all'apertura della scheda: se nel frattempo si toglie
  // una tappa dalla mappa, la prossima apertura la ricalcola.
  const [navTappeAuto, setNavTappeAuto] = useState<any[] | null>(null);
  const handleNavigate = (poi: any) => {
    setNavTappeAuto(tourService.sequenzaPerNavigatore());
    setNavPoi(poi);
  };

  const handleItemClick = (poi: any) => {
    setFocusedId(poi.id);
    onFocus(poi);
  };

  // MEZZO SCHERMO, NON TRE QUARTI (28/08/2026, collaudo). A 78dvh il pannello
  // copriva tutto tranne le chip: la mappa — che e` la cosa su cui si sta
  // decidendo — spariva. A 56dvh restano tracciato e pin in vista sopra, e la
  // lista scorre sotto; su schermo largo il pannello e` una colonna laterale e
  // puo` restare alto.
  return (
    <motion.div
      initial={{ y: "100%", opacity: 0 }}
      animate={{
        y: isCollapsed ? "calc(100% - 70px)" : "0%",
        opacity: 1
      }}
      exit={{ y: "100%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 250, damping: 30 }}
      className="absolute bottom-0 left-0 w-full md:left-6 md:bottom-6 md:w-[420px] max-h-[56dvh] md:max-h-[78dvh] bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-3xl shadow-2xl rounded-t-[2.5rem] md:rounded-[2rem] z-[1100] flex flex-col overflow-hidden border border-black/5"
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
            <h2 className="text-lg font-black text-[#1e3a8a] tracking-tight leading-none">{tr('gr_radar_titolo')}</h2>
            <p className="text-[9px] font-bold text-[#1e3a8a]/60 uppercase tracking-widest mt-1">
              {tr('gr_luoghi_monitorati').replace('{n}', String(uniquePois.length))}
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

      {/* UN SOLO CONTENITORE CHE SCORRE (28/08/2026). Prima scorreva solo la
          lista dei POI in fondo, mentre tempo, arrivo, ordine delle tappe e
          "lungo la strada" erano fissi: con dieci tappe scelte quei blocchi
          riempivano da soli il pannello e la lista restava schiacciata sotto,
          senza altezza e senza scroll — il "+" non si riusciva più a toccare.
          Ora scorre tutto insieme; la barra del giro resta appiccicata in
          alto perché il tasto "Crea giro" deve stare sempre a portata. */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar">
      {/* La barra del giro: compare solo quando c'e` qualcosa da fare.
          Sta in ALTO e non in fondo alla lista, perche' con dieci tappe la
          lista scorre e il tasto sparirebbe proprio quando serve. */}
      {!isCollapsed && scelte.length > 0 && (
        <div className="px-4 py-3 border-b border-black/5 bg-blue-50/95 backdrop-blur flex items-center gap-3 sticky top-0 z-10">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-black text-[#1e3a8a] leading-tight">
              {scelte.length} {scelte.length === 1 ? tr('gr_tappa_scelta') : tr('gr_tappe_scelte')}
              {scelte.length >= MAX_TAPPE && <span className="font-bold text-[#1e3a8a]/50"> · {tr('gr_massimo')}</span>}
            </p>
            <p className={anteprimaEErrore
              ? 'text-[12px] font-bold text-amber-800 leading-snug'
              : 'text-[10px] text-[#1e3a8a]/60 leading-snug'}>
              {rigaAnteprima}
            </p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); tourService.bozzaSvuota(); setErrore(null); }}
            className="px-3 py-2 rounded-xl text-[11px] font-bold text-[#1e3a8a]/60 hover:bg-black/5 transition-colors shrink-0"
          >
            {tr('gr_annulla')}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); creaGiro(); }}
            disabled={creando}
            className="px-4 py-2.5 rounded-xl bg-[#1e3a8a] text-white text-[12px] font-black shadow-md hover:bg-blue-800 transition-colors active:scale-95 disabled:opacity-60 shrink-0"
          >
            {creando
              ? tr('gr_calcolo')
              : (bozza.tappeNelTempo != null && bozza.tappeNelTempo < scelte.length)
                ? tr('gr_crea_giro_n').replace('{n}', String(bozza.tappeNelTempo))
                : tr('gr_crea_giro')}
          </button>
        </div>
      )}

      {/* Senza pass il cancello sta sul server (402). La riga di testo da sola
          non bastava: chi ha appena scelto le tappe deve poter attivare il pass
          da qui, non andare a cercarlo nel profilo (22/08/2026). */}
      {!isCollapsed && passRichiesto && passLocale === true && (
        <div className="px-4 py-2.5 border-b border-black/5 bg-amber-50 flex items-center gap-3">
          <p className="flex-1 text-[11px] text-amber-800 leading-snug">
            {tr('gr_pass_non_riconosciuto')}{bozza.erroreDettaglio ? ` (${bozza.erroreDettaglio})` : ''}
          </p>
          <button
            onClick={(e) => { e.stopPropagation(); setErrore(null); tourService.riprovaPass(); }}
            className="px-3 py-2 rounded-xl bg-[#1e3a8a] text-white text-[11px] font-black shadow-md hover:bg-blue-800 active:scale-95 shrink-0"
          >
            {tr('gr_riprova')}
          </button>
        </div>
      )}
      {!isCollapsed && passRichiesto && passLocale !== true && (
        <div className="px-4 py-2.5 border-b border-black/5 bg-amber-50 flex items-center gap-3">
          <p className="flex-1 text-[11px] text-amber-800 leading-snug">
            {tr('gr_daypass_incluso')}
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const prima = scelte[0] as any;
              const city = prima?.city || prima?.citta;
              window.dispatchEvent(new CustomEvent('wip-open-daypass', { detail: { city } }));
            }}
            className="px-3 py-2 rounded-xl bg-[#1e3a8a] text-white text-[11px] font-black shadow-md hover:bg-blue-800 active:scale-95 shrink-0"
          >
            {tr('gr_attiva_daypass')}
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
          <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[#1e3a8a]/50 mr-1 shrink-0 whitespace-nowrap">{tr('gr_tempo_che_hai')}</span>
            {TEMPI.map(({ min, label }) => (
              <button
                key={label}
                onClick={(e) => { e.stopPropagation(); tourService.bozzaImpostaTempo(min); }}
                className={`px-2.5 py-1.5 min-h-8 rounded-full text-[11px] font-bold border transition-colors shrink-0 whitespace-nowrap ${
                  bozza.minutiDisponibili === min
                    ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]'
                    : 'bg-white text-[#1e3a8a]/70 border-black/10 hover:border-[#1e3a8a]/40'
                }`}
              >
                {min == null ? tr('gr_tempo_tutto') : label}
              </button>
            ))}
          </div>
          {/* Ad anello o aperto. Era sempre ad anello: chi dorme dall'altra
              parte della citta` non vuole tornare al punto di partenza. */}
          <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[#1e3a8a]/50 mr-1 shrink-0 whitespace-nowrap">{tr('gr_arrivo')}</span>
            {/* TRE possibilita`, non due (28/08/2026). L'anello ha DUE mete
                diverse appena il giro viene ricalcolato per strada: il punto
                da cui si e` partiti (l'auto, l'albergo) o quello da cui si
                riparte adesso. Tre chip affiancate invece di un'opzione
                annidata sotto la prima: la riga scorre gia` in orizzontale, e
                una scelta che si vede tutta si capisce senza aprirla. */}
            {([
              { k: 'originale', anello: true, rientro: 'originale' as const, label: tr('gr_torno_da_dove_parto') },
              { k: 'corrente', anello: true, rientro: 'corrente' as const, label: tr('gr_torno_dove_sono') },
              { k: 'aperto', anello: false, rientro: null, label: tr('gr_finisco_ultima') },
            ]).map(({ k, anello, rientro, label }) => {
              const scelta = anello ? bozza.anello && bozza.rientro === rientro : !bozza.anello;
              return (
                <button
                  key={k}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Prima la meta`, poi l'anello: cosi` l'unico ricalcolo che
                    // parte e` quello di `bozzaImpostaAnello`.
                    if (rientro) tourService.impostaRientro(rientro);
                    tourService.bozzaImpostaAnello(anello);
                  }}
                  className={`px-2.5 py-1.5 min-h-8 rounded-full text-[11px] font-bold border transition-colors shrink-0 whitespace-nowrap ${
                    scelta
                      ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]'
                      : 'bg-white text-[#1e3a8a]/70 border-black/10 hover:border-[#1e3a8a]/40'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {bozza.tappeNelTempo != null && bozza.tappeNelTempo < scelte.length && (
            <p className="text-[10px] text-amber-700 leading-snug">
              {(bozza.tappeNelTempo === 1
                ? tr('gr_tempo_ci_sta_1')
                : tr('gr_tempo_ci_stanno_n').replace('{n}', String(bozza.tappeNelTempo))
              ).replace('{m}', String(scelte.length))}
            </p>
          )}

          {scelte.length >= 2 && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wide text-[#1e3a8a]/50">
                  {tr('gr_ordine_trascina')}
                </span>
                {bozza.ordineManuale && (
                  <button
                    onClick={(e) => { e.stopPropagation(); tourService.bozzaOrdineAutomatico(); }}
                    className="text-[10px] font-bold text-blue-600 hover:underline"
                  >
                    {tr('gr_riordina_per_me')}
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
                      {fuori && <span className="text-[9px] font-bold uppercase text-slate-400 shrink-0">{tr('gr_fuori_tempo')}</span>}
                      <button
                        onClick={(e) => { e.stopPropagation(); tourService.bozzaTogli(t.id); }}
                        title={tr('gr_togli_dal_giro')}
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

      {/* LUNGO LA STRADA. Il giro conosce il suo tracciato prima di partire:
          questi sono i posti che sfiorerebbe senza fermarsi, letti lungo il
          corridoio del percorso — anche a 4 km da qui, oltre la finestra del
          radar. E` adesso, con l'ordine ancora aperto, che ha senso
          aggiungerli; in cammino li si sentirebbe solo passando. */}
      {!isCollapsed && scelte.length > 0 && (bozza.cercandoLungoStrada || lungoLaStrada.length > 0) && (
        <div className="px-4 py-2.5 border-b border-black/5 bg-emerald-50/60">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-800/70">
              {lungoLaStrada.length === 1
                ? tr('gr_lungo_strada_1')
                : tr('gr_lungo_strada_n').replace('{n}', String(lungoLaStrada.length))}
            </span>
            {bozza.cercandoLungoStrada && <span className="text-[10px] text-emerald-800/50">{tr('gr_cerco')}</span>}
          </div>
          <div className="space-y-1 max-h-44 overflow-y-auto custom-scrollbar">
            {lungoLaStrada.slice(0, 12).map((p) => (
              <div key={`lungo-${p.id}`} className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-white border border-black/5 shadow-sm">
                <span className="text-base leading-none shrink-0">{(CATEGORY_EMOJIS as any)[p.category || ''] || '📍'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-[#1e3a8a] truncate">{p.name}</p>
                  <p className="text-[9px] text-[#1e3a8a]/50 tabular-nums">
                    {tr('gr_dal_percorso')
                      .replace('{n}', String(p.distanza_dal_percorso))
                      .replace('{x}', (p.metri_lungo / 1000).toFixed(1))}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); scegli(p); }}
                  disabled={scelte.length >= MAX_TAPPE}
                  title={tr('gr_aggiungi_al_giro')}
                  className="w-7 h-7 rounded-lg bg-emerald-600 text-white text-[15px] font-black flex items-center justify-center shrink-0 hover:bg-emerald-700 active:scale-95 disabled:bg-black/10 disabled:text-black/20"
                >
                  +
                </button>
              </div>
            ))}
          </div>
          {lungoLaStrada.length > 12 && (
            <p className="text-[9px] text-[#1e3a8a]/50 mt-1">
              {tr('gr_altri_passando').replace('{n}', String(lungoLaStrada.length - 12))}
            </p>
          )}
        </div>
      )}

      {/* Lista POI: scorre col resto del pannello (vedi sopra). */}
      <div className="p-4 space-y-3 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
        <AnimatePresence initial={false}>
          {uniquePois.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-16 text-center opacity-40">
              <MapPin className="w-10 h-10 mb-3" />
              <p className="font-bold text-xs px-10 text-primary">{tr('gr_nessun_poi')}</p>
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
                          title={dentro ? tr('gr_togli_dal_giro') : tr('gr_aggiungi_al_giro')}
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
      </div>
      <NavChoiceSheet
        poi={navPoi}
        tappeAuto={navTappeAuto}
        language={language}
        onClose={() => { setNavPoi(null); setNavTappeAuto(null); }}
      />
    </motion.div>
  );
}
