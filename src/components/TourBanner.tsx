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
 *
 * Due momenti in piu`, che compaiono solo quando servono:
 *  - la PROPOSTA dopo una X ("a 120 m c'e` X, lo metto al suo posto?"):
 *    togliere e basta lascia un giro piu` povero, non un giro migliore;
 *  - il GIRO FINITO: salvare nei propri itinerari e condividere il link.
 *    Un giro camminato una volta diventa contenuto che resta.
 */
import { useEffect, useState } from 'react';
import { Pause, Play, RotateCcw, SkipForward, X, Navigation2, Check, Share2, BookmarkPlus, Flag } from 'lucide-react';
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

/** La posizione per il ricalcolo: GPS se risponde in fretta, altrimenti l'ultima nota. */
function conPosizione(fn: (p?: { lat: number; lon: number }) => void) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return fn();
  navigator.geolocation.getCurrentPosition(
    (p) => fn({ lat: p.coords.latitude, lon: p.coords.longitude }),
    () => fn(),
    { timeout: 4000, maximumAge: 15000 },
  );
}

export default function TourBanner({ language, istruzione, metriAllaSvolta, onRiascolta, onChiudi }: Props) {
  const [v, setV] = useState<VistaGiro | null>(tourService.vista());
  const [pausaManuale, setPausaManuale] = useState(false);
  const [salvato, setSalvato] = useState<{ id: string; link: string | null } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [avviso, setAvviso] = useState<string | null>(null);

  useEffect(() => tourService.ascolta(setV), []);
  useEffect(() => {
    if (!avviso) return;
    const t = setTimeout(() => setAvviso(null), 2500);
    return () => clearTimeout(t);
  }, [avviso]);

  // ☔ Pioggia in arrivo (23/08/2026): rainProb del meteo MET (massimo delle
  // prossime 3 ore) sul punto della tappa corrente. Ogni 15 minuti, solo con
  // un giro in corso; sotto il 50% non si dice niente — un banner che grida
  // "20% di pioggia" e' rumore.
  const [pioggiaProb, setPioggiaProb] = useState<number | null>(null);
  const tLat = v?.tappaLat, tLon = v?.tappaLon;
  useEffect(() => {
    if (tLat == null || tLon == null) { setPioggiaProb(null); return; }
    let vivo = true;
    const carica = async () => {
      try {
        const { getApiUrl } = await import('../lib/api');
        const r = await fetch(getApiUrl(`/api/meteo/punto?lat=${tLat.toFixed(3)}&lon=${tLon.toFixed(3)}`));
        if (!r.ok || !vivo) return;
        const d = await r.json();
        if (vivo) setPioggiaProb(Number.isFinite(Number(d?.rainProb)) ? Number(d.rainProb) : null);
      } catch { /* senza meteo il giro va avanti uguale */ }
    };
    carica();
    const t = setInterval(carica, 15 * 60_000);
    return () => { vivo = false; clearInterval(t); };
    // Riagganciato alla TAPPA (non alla posizione): cambia poche volte a giro.
  }, [tLat != null && tLon != null ? `${tLat.toFixed(3)},${tLon.toFixed(3)}` : 'niente']);

  if (!v) return null;

  const percentuale = v.metriTotali > 0
    ? Math.max(0, Math.min(100, Math.round((1 - v.metriRimanenti / v.metriTotali) * 100)))
    : 0;

  const distanza = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);
  const t = (k: string) => getTranslation(k, language);

  const salva = async () => {
    if (salvando) return;
    setSalvando(true);
    try {
      const r = await tourService.salvaComeItinerario();
      setSalvato({ id: r.id, link: r.link });
      setAvviso(t('tour_salvato'));
    } catch (e: any) {
      setAvviso(String(e?.message || t('gr_salvataggio_fallito')));
    } finally { setSalvando(false); }
  };

  const condividi = async () => {
    // Condividere vuol dire prima salvare: il link apre la cache condivisa.
    // salvaComeItinerario riusa l'id e la promise in corso: Salva e Condividi
    // ravvicinati non creano due righe.
    let link = salvato?.link;
    if (!link) {
      try { const r = await tourService.salvaComeItinerario(); setSalvato({ id: r.id, link: r.link }); link = r.link; }
      catch (e: any) { setAvviso(String(e?.message || t('gr_condivisione_fallita'))); return; }
    }
    // Senza cache condivisa non c'e' un link che apra qualcosa: si dice, non
    // si finge.
    if (!link) { setAvviso(t('tour_salvato')); return; }
    const titolo = tourService.comeItinerario()?.titolo || 'WIP';
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({ title: titolo, text: titolo, url: link });
        return;
      }
    } catch { /* annullato dall'utente o non supportato: si copia */ }
    try { await navigator.clipboard.writeText(link); setAvviso(t('tour_link_copiato')); }
    catch { setAvviso(link); }
  };

  const finito = v.stato === 'FINITO';

  return (
    <div className="fixed left-0 right-0 bottom-0 z-[9000] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pointer-events-none">
      <div className="mx-auto max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden pointer-events-auto">

        {/* Avanzamento: una riga sola, ma dice tutto a colpo d'occhio */}
        <div className="h-1 bg-gray-100">
          <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${finito ? 100 : percentuale}%` }} />
        </div>

        {/* L'istruzione corrente. In pausa non si mostra: sarebbe un sollecito */}
        {/* Dalla prop se il genitore la passa, altrimenti dalla vista del giro:
            App.tsx non l'ha mai passata e l'istruzione restava invisibile. */}
        {(istruzione ?? v.istruzione) && !v.inPausa && !finito && (
          <div className="flex items-center gap-2.5 px-4 pt-3">
            <Navigation2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <p className="text-[13px] font-bold text-gray-900 leading-snug flex-1">{istruzione ?? v.istruzione}</p>
            {(metriAllaSvolta ?? v.metriAllaSvolta) != null && (
              <span className="text-[11px] font-bold text-blue-600 tabular-nums flex-shrink-0">{distanza((metriAllaSvolta ?? v.metriAllaSvolta) as number)}</span>
            )}
          </div>
        )}

        {/* La proposta dopo una X: una riga, due risposte. Scade da sola. */}
        {v.proposta && !finito && (
          <div className="mx-3 mt-3 px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-100 flex items-center gap-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-gray-900 leading-snug truncate">
                {v.proposta.sostituta.nome} <span className="text-blue-600 tabular-nums">· {v.proposta.metri} m</span>
              </p>
              <p className="text-[10px] text-gray-500 leading-snug truncate">
                {t('tour_al_posto_di')} {v.proposta.tolta.nome} — {t('tour_sostituisci')}
              </p>
            </div>
            <button
              onClick={() => conPosizione((p) => { tourService.accettaSostituta(p); })}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-black active:scale-95 flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" /> {t('tour_si')}
            </button>
            <button
              onClick={() => tourService.rifiutaSostituta()}
              className="px-3 py-1.5 rounded-lg bg-white text-gray-600 text-[11px] font-bold border border-gray-200 active:scale-95"
            >
              {t('tour_no')}
            </button>
          </div>
        )}

        {finito ? (
          /* GIRO FINITO: il cruscotto diventa la cassa. Salva, condividi, chiudi. */
          <div className="px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 flex items-center gap-1">
                <Flag className="w-3 h-3" /> {t('tour_finito')}
              </p>
              <p className="text-[14px] font-bold text-gray-900 truncate">
                {v.tappeFatte} {t('tour_tappa').toLowerCase()} · {distanza(v.metriTotali)}
              </p>
              <p className="text-[11px] text-gray-500 truncate">{avviso || (salvato?.link ? salvato.link.replace(/^https?:\/\//, '') : '')}</p>
              {/* PROSEGUIRE (22/08/2026): il giro finito non e` un vicolo
                  cieco. Si riapre il radar con la bozza vuota e la partenza
                  da qui; o si tocca un pin e si aggiunge al giro in corso. */}
              <button
                onClick={() => {
                  tourService.termina();
                  onChiudi?.();
                  window.dispatchEvent(new CustomEvent('wip-open-radar'));
                }}
                className="mt-1 text-[11px] font-black text-[#1e3a8a] underline underline-offset-2"
              >
                {t('gr_nuovo_giro_da_qui')}
              </button>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={salva}
                disabled={salvando || !!salvato}
                title={t('tour_salva')}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors active:scale-95 ${salvato ? 'bg-emerald-50' : 'bg-gray-100 hover:bg-gray-200'} disabled:opacity-70`}
              >
                {salvato ? <Check className="w-4 h-4 text-emerald-600" /> : <BookmarkPlus className="w-4 h-4 text-gray-700" />}
              </button>
              <button
                onClick={condividi}
                title={t('tour_condividi')}
                className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center transition-colors active:scale-95"
              >
                <Share2 className="w-4 h-4 text-white" />
              </button>
              <button
                onClick={() => { tourService.termina(); onChiudi?.(); }}
                title={t('tour_chiudi')}
                className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors active:scale-95"
              >
                <X className="w-4 h-4 text-gray-700" />
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                {t('tour_tappa')} {Math.min(v.tappeFatte + 1, v.tappeTotali)} / {v.tappeTotali}
              </p>
              <p className="text-[14px] font-bold text-gray-900 truncate">
                {!v.avviato ? t('gr_pronto_a_partire') : v.inPausa ? t('tour_in_pausa') : (v.nomeTappa || '—')}
                {/* Metri alla PORTA della tappa (linea d'aria): il dato che
                    manca all'istruzione, che parla solo della svolta. */}
                {!v.inPausa && v.metriAllaTappa != null && v.metriAllaTappa > 25 && (
                  <span className="text-[11px] font-bold text-blue-600 tabular-nums"> · {distanza(v.metriAllaTappa)}</span>
                )}
              </p>
              {/* Dopo questa, dove si va: una riga piccola che orienta senza
                  aprire la mappa. E la pioggia, solo quando e' probabile. */}
              {!v.inPausa && (v.nomeProssima || (pioggiaProb != null && pioggiaProb >= 50)) && (
                <p className="text-[10px] text-gray-400 truncate">
                  {v.nomeProssima ? `${t('gr_poi_prossima')}: ${v.nomeProssima}` : ''}
                  {v.nomeProssima && pioggiaProb != null && pioggiaProb >= 50 ? ' · ' : ''}
                  {pioggiaProb != null && pioggiaProb >= 50 && (
                    <span className="text-sky-600 font-bold">☔ {t('gr_pioggia_probabile').replace('{n}', String(Math.round(pioggiaProb)))}</span>
                  )}
                </p>
              )}
              <p className="text-[11px] text-gray-500 tabular-nums">
                {avviso ? avviso : (
                  <>
                    {distanza(v.metriRimanenti)} {t('tour_mancanti')}
                    <span className="text-gray-300"> · </span>
                    {distanza(v.metriTotali)} {t('tour_totali')}
                    {/* Ora d'arrivo (23/08/2026): cammino a 4 km/h sui metri
                        rimanenti. Stima onesta: non conta le soste d'ascolto,
                        e infatti dice "~". */}
                    {v.metriRimanenti > 0 && !v.inPausa && (
                      <>
                        <span className="text-gray-300"> · </span>
                        {t('gr_arrivo_eta')} ~{new Date(Date.now() + (v.metriRimanenti / 66.7) * 60000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </>
                    )}
                  </>
                )}
              </p>
            </div>

            {/* PRONTO, NON PARTITO (28/08/2026): un solo tasto grande,
                «Avvia la navigazione», e la X. Pausa, riascolta e salta
                appartengono a un giro in cammino. */}
            {!v.avviato ? (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => tourService.avvia()}
                  title={t('gr_avvia_navigazione')}
                  className="h-10 px-4 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-black flex items-center gap-1.5 transition-colors active:scale-95"
                >
                  <Play className="w-4 h-4" /> {t('gr_avvia_navigazione')}
                </button>
                <button
                  onClick={() => { tourService.termina(); onChiudi?.(); }}
                  title={t('tour_termina')}
                  className="w-10 h-10 rounded-full bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors active:scale-95"
                >
                  <X className="w-4 h-4 text-red-600" />
                </button>
              </div>
            ) : (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => { const p = !pausaManuale; setPausaManuale(p); tourService.impostaPausa(p); }}
                title={pausaManuale ? t('tour_riprendi') : t('tour_pausa')}
                className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors active:scale-95"
              >
                {pausaManuale ? <Play className="w-4 h-4 text-gray-700" /> : <Pause className="w-4 h-4 text-gray-700" />}
              </button>
              <button
                onClick={onRiascolta}
                title={t('tour_riascolta')}
                className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors active:scale-95"
              >
                <RotateCcw className="w-4 h-4 text-gray-700" />
              </button>
              <button
                onClick={() => conPosizione((p) => { tourService.salta(p); })}
                title={t('tour_salta')}
                className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors active:scale-95"
              >
                <SkipForward className="w-4 h-4 text-gray-700" />
              </button>
              <button
                onClick={() => { tourService.termina(); onChiudi?.(); }}
                title={t('tour_termina')}
                className="w-10 h-10 rounded-full bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors active:scale-95"
              >
                <X className="w-4 h-4 text-red-600" />
              </button>
            </div>
            )}
          </div>
        )}

        {/* Il pre-scaricamento, contato davvero: "3 testi, 2 audio, 1
            mancante" con un Riprova. Prima l'esito esisteva e non lo
            vedeva nessuno: offline si scopriva a meta' giro che una tappa
            era muta. Sparisce quando e' tutto in tasca. */}
        {!finito && (v.prescarico.inCorso || (v.prescarico.finitoIl > 0 && v.prescarico.mancanti > 0)) && (
          <div className="px-4 pb-2.5 pt-1 flex items-center gap-2 text-[10px] bg-gray-50">
            <span className={`flex-1 ${v.prescarico.mancanti > 0 && !v.prescarico.inCorso ? 'text-amber-700' : 'text-gray-500'}`}>
              {v.prescarico.inCorso
                ? `${t('tour_prescarico_in_corso')} ${v.prescarico.fatte}/${v.prescarico.totali}`
                : `${v.prescarico.testi} ${t('tour_prescarico_testi')} · ${v.prescarico.audio} ${t('tour_prescarico_audio')} · ${v.prescarico.mancanti} ${t('tour_prescarico_mancanti')}`}
            </span>
            {!v.prescarico.inCorso && v.prescarico.mancanti > 0 && (
              <button
                onClick={() => { tourService.prescarica(undefined, language.toLowerCase()).catch(() => {}); }}
                className="px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-gray-700 font-bold active:scale-95"
              >
                {t('tour_prescarico_riprova')}
              </button>
            )}
          </div>
        )}

        {/* Le tappe irraggiungibili si DICONO. Un errore silenzioso qui fa
            sembrare l'app rotta invece che onesta. */}
        {!finito && tourService.datiGiro()?.problemi?.length ? (
          <p className="px-4 pb-2.5 text-[10px] text-amber-700 bg-amber-50 py-1.5">
            {tourService.datiGiro()!.problemi.length} {t('tour_problemi')}
          </p>
        ) : null}
      </div>
    </div>
  );
}
