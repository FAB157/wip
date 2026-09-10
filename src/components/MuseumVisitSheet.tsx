import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, Camera, Check, Volume2, Pause, Play, Loader2, Landmark, Church, MapPin, ExternalLink, Ticket, Plus, Download, SkipForward } from 'lucide-react';
import { Language, getTranslation } from '../lib/i18n';
import { notify } from '../lib/toast';
import { MuseumVisit, endVisit, countSeen, fetchArtworkGuide, ArtworkGuide, fetchMoreArtworks, fetchEsperienzeMuseo, EsperienzaMuseo, skipStop, unskipStop } from '../lib/museumVisit';
import { scaricaPacchettoMuseo, museoScaricato, operaDallArchivio, conservaVisita, conservaOpera } from '../lib/pacchettoMuseo';
import { speakAudioguide, stopSpeech } from '../services/ttsService';
import { getGuideCharacter } from '../lib/guideSettings';
import { formatPassRemaining } from '../lib/museumPass';

interface MuseumVisitSheetProps {
  visit: MuseumVisit;
  language: Language;
  passExpiresAt: number | null;
  onClose: () => void;
  /** «Inquadra la prossima opera»: chiude la scheda e apre l'obiettivo. */
  onScanNext: () => void;
}

/**
 * Scheda della VISITA GUIDATA: dove sei, il percorso consigliato con le
 * tappe già viste spuntate, l'introduzione da ascoltare. Tema chiaro come
 * la scheda Vision (VisionCardSheet), perché si apre sopra di essa.
 */
export default function MuseumVisitSheet({ visit, language, passExpiresAt, onClose, onScanNext }: MuseumVisitSheetProps) {
  const t = (key: string) => getTranslation(key, language);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  // Audioguida della singola opera: quale tappa sta caricando/parlando e il
  // testo aperto sotto la tappa (250-350 parole, come al museo).
  const [operaAperta, setOperaAperta] = useState<number | null>(null);
  const [operaGuide, setOperaGuide] = useState<Record<number, ArtworkGuide>>({});
  const [operaLoading, setOperaLoading] = useState<number | null>(null);
  const [operaParla, setOperaParla] = useState<number | null>(null);
  // Scaricamento per l'uso senza rete e ampliamento del percorso.
  const [scaricando, setScaricando] = useState<{ fatte: number; totali: number } | null>(null);
  const [scaricato, setScaricato] = useState(() => !!museoScaricato(visit.venueKey, language));
  const [aggiungendo, setAggiungendo] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);

  useEffect(() => () => { stopSpeech(); }, []);

  // La visita entra in archivio appena si apre, e si aggiorna quando il
  // percorso cambia (opere aggiunte, tappe spuntate o saltate). Senza questo
  // le audioguide ascoltate non avrebbero dove essere conservate, e fra sei
  // ore — quando la visita in corso scade — resterebbe solo il ricordo.
  useEffect(() => {
    conservaVisita(visit, language);
  }, [visit.venueKey, visit.guide?.tappe?.length, visit.updatedAt, language]);

  useEffect(() => {
    const su = () => setOnline(true);
    const giu = () => setOnline(false);
    window.addEventListener('online', su);
    window.addEventListener('offline', giu);
    return () => { window.removeEventListener('online', su); window.removeEventListener('offline', giu); };
  }, []);

  // Esperienze prenotabili del museo: solo con la rete e solo per chi ha il
  // pass (il server rifiuta agli altri). Best-effort: se non ci sono, la
  // sezione non compare.
  const [esperienze, setEsperienze] = useState<EsperienzaMuseo[]>([]);
  useEffect(() => {
    if (!online) return;
    let vivo = true;
    fetchEsperienzeMuseo(visit, language).then(e => { if (vivo) setEsperienze(e); });
    return () => { vivo = false; };
  }, [visit.venueKey, language, online]);

  /** Scarica tutto: percorso, audioguide di ogni opera, foto. */
  const handleScarica = async () => {
    if (scaricando) return;
    setScaricando({ fatte: 0, totali: visit.guide.tappe.length });
    try {
      const esito = await scaricaPacchettoMuseo(visit, language, (fatte, totali) => setScaricando({ fatte, totali }));
      setScaricato(true);
      notify(
        esito.mancanti.length
          ? t('mv_scaricato_parziale').replace('{n}', String(esito.opere)).replace('{t}', String(esito.opereTotali))
          : t('mv_scaricato').replace('{n}', String(esito.opere)),
        'success'
      );
    } catch {
      notify(t('vis_generic_error'));
    } finally {
      setScaricando(null);
    }
  };

  /** «Aggiungi opere»: l'AI propone le opere minori non ancora nel percorso. */
  const handleAggiungiOpere = async () => {
    if (aggiungendo || !online) return;
    setAggiungendo(true);
    const out = await fetchMoreArtworks(visit, language);
    setAggiungendo(false);
    if (out.ok && out.added.length) {
      notify(t('mv_aggiunte').replace('{n}', String(out.added.length)), 'success');
    } else {
      notify(out.reason === 'needs_tour_pass' ? t('mv_locked_title') : t('mv_niente_altre'));
    }
  };

  const seen = countSeen(visit);
  const total = visit.guide.tappe.length;
  const passActive = passExpiresAt !== null && passExpiresAt > Date.now();
  const isChurch = visit.guide.tipo === 'chiesa';
  const TypeIcon = isChurch ? Church : Landmark;

  // Introduzione + le tappe ancora da vedere, come una guida che accompagna.
  const audioText = () => {
    const next = visit.guide.tappe.filter(x => !x.seenCardId).slice(0, 4);
    const parts = [visit.guide.intro];
    if (visit.guide.consiglio) parts.push(visit.guide.consiglio);
    next.forEach(x => parts.push(`${x.nome}${x.dove ? ` (${x.dove})` : ''}. ${x.perche}`));
    return parts.filter(Boolean).join('\n');
  };

  const handleAudio = async () => {
    if (audioLoading) return;
    if (audioPlaying) { stopSpeech(); setAudioPlaying(false); return; }
    setAudioLoading(true);
    try {
      await speakAudioguide(audioText(), String(visit.guide.language || language).toLowerCase(), getGuideCharacter(), () => setAudioPlaying(false));
      setAudioPlaying(true);
    } catch {
      setAudioPlaying(false);
    } finally {
      setAudioLoading(false);
    }
  };

  const handleEnd = () => {
    stopSpeech();
    endVisit();
    onClose();
  };

  /**
   * Ascolta l'audioguida dettagliata di UNA tappa: la chiede al server la
   * prima volta (poi resta in cache lato server per tutti) e la legge con la
   * voce della guida. Un secondo tocco la ferma.
   */
  const handleOpera = async (i: number) => {
    const tappa = visit.guide.tappe[i];
    if (!tappa) return;
    if (operaParla === i) { stopSpeech(); setOperaParla(null); return; }
    stopSpeech();
    setOperaParla(null);

    let guida = operaGuide[i];
    // ARCHIVIO: se il museo è stato scaricato, il testo è già nostro. Non si
    // chiama il server e NON si ripaga: quello che hai scaricato è tuo.
    if (!guida) {
      const dallArchivio = operaDallArchivio(visit.venueKey, language, tappa.nome);
      if (dallArchivio) {
        guida = dallArchivio;
        setOperaGuide(prev => ({ ...prev, [i]: dallArchivio }));
      }
    }
    if (!guida) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        notify(t('mv_offline_non_scaricata'));
        return;
      }
      setOperaLoading(i);
      const resp = await fetchArtworkGuide({
        artwork: tappa.nome,
        venueName: visit.venue.name,
        artist: tappa.autore || null,
        room: tappa.dove || null,
        language,
      });
      setOperaLoading(null);
      if (!resp) { notify(t('vis_generic_error')); return; }
      if (resp.ok !== true) {
        notify(
          resp.reason === 'needs_pass' ? t('mv_art_needs_pass')
            : resp.reason === 'pass_exhausted' ? t('mv_art_exhausted')
            : t('mv_art_no_source')
        );
        return;
      }
      guida = resp.guide;
      setOperaGuide(prev => ({ ...prev, [i]: guida }));
      // TUTTO QUELLO CHE ASCOLTI RESTA: l'audioguida appena pagata entra
      // subito nell'archivio. Da adesso in poi il riascolto — stasera, fra
      // un mese, senza rete — non chiama più il server e non costa più nulla.
      conservaOpera(visit.venueKey, language, tappa.nome, guida);
    }
    setOperaAperta(i);
    try {
      await speakAudioguide(guida.testo, String(guida.language || language).toLowerCase(), getGuideCharacter(), () => setOperaParla(null));
      setOperaParla(i);
    } catch {
      setOperaParla(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[2600] bg-black/60 backdrop-blur-sm flex items-end sm:items-center sm:justify-center" onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={t('mv_title')}
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className="bg-[#fdfbf7] w-full sm:max-w-md max-h-[92vh] rounded-t-[2rem] sm:rounded-[2rem] overflow-hidden flex flex-col shadow-2xl"
      >
        {/* Testata */}
        <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3 shrink-0">
          {/* La foto DEL LUOGO nel cerchio, accanto al nome: la stessa cosa
              che fanno le opere nel percorso. Senza foto dichiarata resta il
              solo nome — mai l'immagine di un altro museo. */}
          {visit.venuePhotoIcon && (
            <img
              src={visit.venuePhotoIcon}
              alt=""
              loading="lazy"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              className="w-12 h-12 rounded-full object-cover border border-slate-200 shrink-0"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('mv_title')}</p>
            <h2 className="text-lg font-black text-primary leading-tight truncate">{visit.venue.name}</h2>
            <p className="text-[11px] font-bold text-slate-500 flex items-center gap-1 mt-0.5">
              <TypeIcon className="w-3.5 h-3.5" />
              {isChurch ? t('mv_type_church') : visit.guide.tipo === 'sito' ? t('mv_type_site') : t('mv_type_museum')}
              <span>·</span>
              {t('mv_seen_count').replace('{n}', String(seen)).replace('{t}', String(total))}
            </p>
          </div>
          <button onClick={onClose} aria-label={t('vis_close')} className="w-10 h-10 shrink-0 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-900 active:scale-90 transition-transform">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {/* Pass Museo, se attivo */}
          {passActive && passExpiresAt !== null && (
            <div className="flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-amber-50 border border-amber-300 mb-3">
              <div className="w-9 h-9 rounded-xl bg-amber-200 flex items-center justify-center shrink-0">
                <Ticket className="w-4 h-4 text-amber-800" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black text-amber-900">{getTranslation('museum_pass_active', language)}</p>
                <p className="text-[11px] font-bold text-amber-800/80">{getTranslation('museum_pass_remaining', language)} {formatPassRemaining(passExpiresAt)}</p>
              </div>
            </div>
          )}

          {/* Introduzione: dove sei */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-3">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{t('mv_you_are_at')}</p>
                <p className="text-sm text-slate-800 leading-relaxed">{visit.guide.intro}</p>
                {visit.guide.consiglio && (
                  <p className="text-[12px] font-bold text-primary mt-2 leading-snug">{visit.guide.consiglio}</p>
                )}
              </div>
              <button
                onClick={handleAudio}
                aria-label={audioPlaying ? t('vis_pause') : t('mv_listen')}
                className="w-11 h-11 shrink-0 rounded-full bg-primary text-white flex items-center justify-center shadow-lg active:scale-90 transition-transform"
              >
                {audioLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : audioPlaying ? <Pause className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Percorso */}
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">{t('mv_route')}</p>
          {/* Se il museo non pubblica le sale lo si dice qui, una volta: senza
              questa riga venti tappe numerate promettono un itinerario che il
              museo non ha mai dichiarato. */}
          {visit.guide.saleDichiarate === false && (
            <p className="text-[11px] font-bold text-slate-500 leading-snug mb-2 px-3 py-2 rounded-xl bg-white border border-slate-200">
              {t('mv_no_rooms')}
            </p>
          )}
          <ol className="space-y-2">
            {visit.guide.tappe.map((tappa, i) => {
              const done = !!tappa.seenCardId;
              // Il numero conta solo le tappe con una sala dichiarata: quelle
              // «della collezione» non hanno un posto nel percorso, quindi non
              // hanno un numero.
              const numero = visit.guide.tappe.slice(0, i + 1).filter(x => !x.soloCollezione).length;
              // Si visita per stanze: quando cambia la sala si apre un gruppo,
              // così si vede a colpo d'occhio quante opere ci sono in questa
              // stanza prima di spostarsi. Il server le ha già raggruppate.
              const salaQui = tappa.soloCollezione ? '' : String(tappa.dove || '').trim();
              const salaPrima = i === 0 ? null : (visit.guide.tappe[i - 1].soloCollezione ? '' : String(visit.guide.tappe[i - 1].dove || '').trim());
              const apreSala = !!salaQui && salaQui !== salaPrima;
              const quanteQui = apreSala ? visit.guide.tappe.filter(x => !x.soloCollezione && String(x.dove || '').trim() === salaQui).length : 0;
              const primaSenzaSala = !!tappa.soloCollezione && (i === 0 || !visit.guide.tappe[i - 1].soloCollezione);
              return (
              <div key={`g-${i}-${tappa.nome}`}>
                {apreSala && (
                  <div className="flex items-center gap-2 px-1 pt-2 pb-1.5">
                    <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-[11px] font-black text-primary truncate">{salaQui}</span>
                    <span className="text-[10px] font-bold text-slate-400 shrink-0">
                      {t('mv_in_room').replace('{n}', String(quanteQui))}
                    </span>
                  </div>
                )}
                {primaSenzaSala && (
                  <div className="flex items-center gap-2 px-1 pt-3 pb-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('mv_also_in_collection')}</span>
                  </div>
                )}
                <li key={`${i}-${tappa.nome}`} className={`flex gap-3 px-3.5 py-3 rounded-2xl border transition-opacity ${done ? 'bg-emerald-50 border-emerald-200' : tappa.skipped ? 'bg-white border-slate-200 opacity-60' : 'bg-white border-slate-200'}`}>
                  {/* La foto dell'opera nel cerchio, col numero quando manca */}
                  {tappa.fotoIcona ? (
                    <div className="relative w-11 h-11 shrink-0">
                      <img
                        src={tappa.fotoIcona}
                        alt=""
                        loading="lazy"
                        className="w-11 h-11 rounded-full object-cover border border-slate-200"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                      <div className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black border-2 border-white ${done ? 'bg-emerald-600 text-white' : tappa.soloCollezione ? 'bg-slate-400 text-white' : 'bg-primary text-white'}`}>
                        {done ? <Check className="w-2.5 h-2.5" /> : tappa.soloCollezione ? '·' : numero}
                      </div>
                    </div>
                  ) : (
                    <div className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-black ${done ? 'bg-emerald-600 text-white' : tappa.soloCollezione ? 'bg-slate-400 text-white' : 'bg-primary text-white'}`}>
                      {done ? <Check className="w-3.5 h-3.5" /> : tappa.soloCollezione ? '·' : numero}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900 leading-tight">{tappa.nome}</p>
                    {/* Il titolo com'è scritto sul muro: è quello che il
                        visitatore legge davvero mentre cerca l'opera. */}
                    {tappa.nomeOriginale && (
                      <p className="text-[11px] font-bold text-slate-400 italic leading-tight mt-0.5">
                        {t('mv_on_the_label')}: {tappa.nomeOriginale}
                      </p>
                    )}
                    {(tappa.autore || tappa.anno || tappa.dove) && (
                      <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                        {[tappa.autore, tappa.anno].filter(Boolean).join(' · ')}
                        {tappa.dove ? `${tappa.autore || tappa.anno ? ' · ' : ''}${tappa.dove}` : ''}
                      </p>
                    )}
                    {tappa.perche && <p className="text-[12px] text-slate-700 leading-snug mt-1">{tappa.perche}</p>}
                    {/* Promessa onesta: il museo la possiede, ma non dice dove
                        è esposta — e potrebbe essere in deposito o in prestito. */}
                    {tappa.soloCollezione && !done && (
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mt-1">{t('mv_only_collection')}</p>
                    )}
                    {done && <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700 mt-1">{t('mv_seen')}</p>}

                    {/* Audioguida dettagliata dell'opera: il testo si apre
                        sotto la tappa e viene letto ad alta voce. */}
                    <button
                      onClick={() => void handleOpera(i)}
                      disabled={operaLoading !== null}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-[11px] font-black text-primary active:scale-95 transition-transform disabled:opacity-50"
                    >
                      {operaLoading === i ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : operaParla === i ? <Pause className="w-3.5 h-3.5" />
                        : <Volume2 className="w-3.5 h-3.5" />}
                      {operaParla === i ? t('vis_pause') : t('mv_art_listen')}
                    </button>

                    {/* «Non la trovo»: la sala è chiusa, l'opera è in prestito
                        o c'è la fila. Il percorso prosegue invece di fermarsi
                        qui — e se in tanti saltano la stessa opera, quella
                        tappa è sbagliata e ce lo stanno dicendo dal posto. */}
                    {!done && (
                      <button
                        onClick={() => { if (tappa.skipped) unskipStop(i); else skipStop(i); }}
                        className={`mt-2 ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-black active:scale-95 transition-transform ${
                          tappa.skipped
                            ? 'bg-white border-slate-300 text-slate-500'
                            : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        <SkipForward className="w-3.5 h-3.5" />
                        {tappa.skipped ? t('mv_unskip') : t('mv_skip')}
                      </button>
                    )}

                    {operaAperta === i && operaGuide[i] && (
                      <div className="mt-2 rounded-2xl bg-[#f8f5f0] border border-slate-200 overflow-hidden">
                        {/* Comandi come su un'audioguida vera: play e pausa
                            sempre visibili mentre si legge il testo. */}
                        <div className="flex items-center gap-3 px-3 py-2.5 bg-white border-b border-slate-200">
                          <button
                            onClick={() => void handleOpera(i)}
                            aria-label={operaParla === i ? t('vis_pause') : t('mv_art_listen')}
                            className="w-11 h-11 shrink-0 rounded-full bg-primary text-white flex items-center justify-center shadow-md active:scale-90 transition-transform"
                          >
                            {operaLoading === i ? <Loader2 className="w-5 h-5 animate-spin" />
                              : operaParla === i ? <Pause className="w-5 h-5" />
                              : <Play className="w-5 h-5 ml-0.5" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-black text-slate-900 truncate">{operaGuide[i].titolo || tappa.nome}</p>
                            <p className="text-[10px] font-bold text-slate-500">
                              {operaParla === i ? t('mv_art_playing') : t('mv_art_ready')}
                              {' · '}
                              {Math.max(1, Math.round((operaGuide[i].parole || 0) / 150))} min
                            </p>
                          </div>
                          <button
                            onClick={() => { stopSpeech(); setOperaParla(null); setOperaAperta(null); }}
                            aria-label={t('vis_close')}
                            className="w-8 h-8 shrink-0 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 active:scale-90 transition-transform"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {/* La foto dell'opera, grande: si guarda mentre parla */}
                        {(operaGuide[i].foto || tappa.foto) && (
                          <img
                            src={operaGuide[i].foto || tappa.foto}
                            alt={operaGuide[i].titolo || tappa.nome}
                            loading="lazy"
                            className="w-full max-h-56 object-contain bg-slate-100"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                        <div className="p-3">
                          {(operaGuide[i].tecnica || operaGuide[i].misure) && (
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                              {[operaGuide[i].tecnica, operaGuide[i].misure].filter(Boolean).join(' · ')}
                            </p>
                          )}
                          <p className="text-[12px] text-slate-800 leading-relaxed whitespace-pre-line">{operaGuide[i].testo}</p>
                          {operaGuide[i].daGuardare.length > 0 && (
                            <div className="mt-2.5 p-2.5 rounded-xl bg-white border border-slate-200">
                              <p className="text-[10px] font-black uppercase tracking-wider text-primary mb-1">{t('mv_art_look_for')}</p>
                              <ul className="space-y-0.5">
                                {operaGuide[i].daGuardare.map((d, k) => (
                                  <li key={k} className="text-[11px] text-slate-700 leading-snug">· {d}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {operaGuide[i].curiosita && (
                            <div className="mt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                              <p className="text-[10px] font-black uppercase tracking-wider text-amber-800 mb-1">{t('mv_art_curiosity')}</p>
                              <p className="text-[11px] text-amber-900 leading-snug">{operaGuide[i].curiosita}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              </div>
              );
            })}
          </ol>

          {/* Esperienze prenotabili: biglietti e visite guidate col prezzo.
              Compaiono solo a chi ha il pass, e solo se ce ne sono davvero. */}
          {esperienze.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">{t('mv_esperienze')}</p>
              <div className="space-y-2">
                {esperienze.map((e, i) => (
                  <a
                    key={`${i}-${e.titolo}`}
                    href={e.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow sponsored"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white border border-slate-200 active:scale-[0.99] transition-transform"
                  >
                    {e.foto ? (
                      <img src={e.foto} alt="" loading="lazy" className="w-12 h-12 rounded-xl object-cover shrink-0" onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                        <Ticket className="w-5 h-5 text-amber-700" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-black text-slate-900 leading-tight line-clamp-2">{e.titolo}</p>
                      <p className="text-[11px] font-bold text-slate-500">
                        {[e.prezzo, e.durata, e.voto].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
                  </a>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">{t('mv_esperienze_nota')}</p>
            </div>
          )}

          {visit.source?.url && (
            <a href={visit.source.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-slate-500">
              <ExternalLink className="w-3 h-3" /> {t('mv_source')}: Wikipedia
            </a>
          )}
          <p className="text-[10px] text-slate-400 mt-2">{t('vis_ai_disclaimer')}</p>
        </div>

        {/* Azioni */}
        <div className="px-5 pb-6 pt-2 shrink-0 space-y-2 bg-[#fdfbf7]">
          <button
            onClick={onScanNext}
            className="w-full py-3.5 rounded-2xl bg-primary text-white font-black text-sm shadow-lg active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
          >
            <Camera className="w-4 h-4" />
            {t('mv_next')}
          </button>

          <div className="flex gap-2">
            {/* Aggiungi opere: solo con la rete, come deciso dal committente */}
            {online && (
              <button
                onClick={() => void handleAggiungiOpere()}
                disabled={aggiungendo}
                className="flex-1 py-3 rounded-2xl bg-white border border-primary/40 text-primary font-black text-[13px] active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {aggiungendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {t('mv_aggiungi_opere')}
              </button>
            )}
            {/* Scarica tutto: percorso, audioguide, foto */}
            <button
              onClick={() => void handleScarica()}
              disabled={!!scaricando || !online}
              className={`flex-1 py-3 rounded-2xl border font-black text-[13px] active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-60 ${
                scaricato ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-slate-200 text-slate-700'
              }`}
            >
              {scaricando ? <Loader2 className="w-4 h-4 animate-spin" />
                : scaricato ? <Check className="w-4 h-4" />
                : <Download className="w-4 h-4" />}
              {scaricando
                ? `${scaricando.fatte}/${scaricando.totali}`
                : scaricato ? t('mv_disponibile_offline') : t('mv_scarica_tutto')}
            </button>
          </div>

          <button onClick={handleEnd} className="w-full py-3 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold text-sm active:scale-[0.98] transition-transform flex items-center justify-center gap-2">
            <MapPin className="w-4 h-4" />
            {t('mv_end')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
