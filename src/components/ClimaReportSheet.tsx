import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, FileText, Volume2, ArrowLeftRight } from "lucide-react";
import { Language, getTranslation } from "../lib/i18n";
import { coloreClima, livelloClima, nomeMese, testoPeriodi, fetchReportClima, fetchReportMese, fetchDatiClima, cercaCitta, oreLuceMese, classificaMese, testoDaLeggere } from "../lib/climaIndex";
import type { DatiClima, ReportClima, ReportMese, ConfrontoAdesso } from "../lib/climaIndex";
import { notify } from "../lib/toast";

/**
 * «QUANDO VISITARE», IN DUE MODI (24/09/2026, committente: «meglio avere 2
 * opzioni: una scheda generica con tutto l'anno ed una più specifica del
 * mese»). ANNO = scegliere il periodo: tabella dei 12 mesi, tendenza, mare,
 * report completo dal web. MESE = prepararsi: un mese solo, con la sua
 * posizione in classifica, il confronto coi mesi vicini e la scheda AI
 * cercata sul web per quel mese (consigli, esperienze, eventi).
 *
 * Due materiali sempre distinti a vedersi: le STATISTICHE (NASA POWER,
 * MUR, MET) e COSA DICE IL WEB, riscritto dall'AI con la fonte accanto a
 * ogni voce; le esperienze dei viaggiatori restano opinioni. L'AI la fa
 * generare solo chi ha l'account («ospiti no»); poi è in cache per tutti.
 * Portal sul body come NavChoiceSheet: la mappa sta in contenitori con
 * transform che chiuderebbero un fixed nel loro riquadro.
 *
 * Lo stesso componente serve al livello Clima della mappa e a «Quando
 * andare» nella scheda Itinerario: una scheda sola, tre ingressi.
 */
interface Props {
  aperto: boolean;
  onClose: () => void;
  lat: number;
  lon: number;
  /** Nome della città se chi apre lo sa già (Piano); altrimenti arriva dal report. */
  nome?: string;
  dati: DatiClima | null;
  adesso?: ConfrontoAdesso | null;
  language: Language | string;
  /** Apre direttamente nel modo Mese su quel mese (dall'avviso del pianificatore). */
  meseIniziale?: number | null;
}

const P = ({ children }: { children: ReactNode }) => <p className="text-[13px] leading-snug text-gray-800 dark:text-gray-100">{children}</p>;

export default function ClimaReportSheet({ aperto, onClose, lat, lon, nome, dati: datiEsterni, adesso, language, meseIniziale }: Props) {
  const lang = language as Language;
  const tr = (k: string) => getTranslation(k, lang);
  const L = String(language);
  const [dati, setDati] = useState<DatiClima | null>(datiEsterni);
  const [modo, setModo] = useState<'anno' | 'mese'>(meseIniziale ? 'mese' : 'anno');
  const [mese, setMese] = useState<number>(meseIniziale || new Date().getMonth() + 1);
  const [report, setReport] = useState<ReportClima | null>(null);
  const [reportMese, setReportMese] = useState<ReportMese | null>(null);
  const [errore, setErrore] = useState<'accesso' | 'non_disponibile' | null>(null);
  const [caricamento, setCaricamento] = useState(false);
  const [tentativo, setTentativo] = useState(0);
  // Confronto con un'altra città: ricerca, dati e nome.
  const [confrontoAperto, setConfrontoAperto] = useState(false);
  const [confrontoTesto, setConfrontoTesto] = useState('');
  const [confronto, setConfronto] = useState<{ nome: string; dati: DatiClima } | null>(null);
  const [confrontoErr, setConfrontoErr] = useState(false);
  const [pdfInCorso, setPdfInCorso] = useState(false);

  useEffect(() => { setDati(datiEsterni); }, [datiEsterni]);
  useEffect(() => { if (aperto && meseIniziale) { setModo('mese'); setMese(meseIniziale); } }, [aperto, meseIniziale]);
  // Le statistiche, se chi apre non le ha (Piano): sono gratis e pubbliche.
  useEffect(() => {
    if (!aperto || datiEsterni) return;
    let vivo = true;
    fetchDatiClima(lat, lon, L, true).then((d) => { if (vivo) setDati(d); });
    return () => { vivo = false; };
  }, [aperto, lat, lon, L, datiEsterni]);
  // Il report del modo corrente (annuale o del mese).
  useEffect(() => {
    if (!aperto) return;
    let vivo = true;
    setCaricamento(true); setErrore(null);
    const p = modo === 'anno'
      ? fetchReportClima(lat, lon, L).then((r) => { if (vivo) { setReport(r.report); setErrore(r.errore); } })
      : fetchReportMese(lat, lon, mese, L).then((r) => { if (vivo) { setReportMese(r.report); setErrore(r.errore); } });
    p.finally(() => { if (vivo) setCaricamento(false); });
    return () => { vivo = false; };
  }, [aperto, lat, lon, L, tentativo, modo, mese]);
  useEffect(() => { if (!aperto) { setConfronto(null); setConfrontoAperto(false); setConfrontoTesto(''); } }, [aperto]);

  if (!aperto) return null;
  const citta = nome || report?.citta || reportMese?.citta || '';
  const tierTesto = (t: 'A' | 'B' | 'C') => tr(t === 'A' ? 'mp_clima_fonte_affidabile' : t === 'C' ? 'mp_clima_fonte_forum' : 'mp_clima_fonte_blog');
  const Sezione = ({ titolo, children }: { titolo: string; children: ReactNode }) => (
    <section className="mt-4">
      <h3 className="text-[12px] font-black uppercase tracking-wide text-[#1e3a8a] dark:text-blue-200 mb-1.5">{titolo}</h3>
      {children}
    </section>
  );
  const voce = (v: { testo: string; fonte: string }, i: number) => (
    <li key={i} className="text-[13px] leading-snug text-gray-800 dark:text-gray-100 mb-1.5">
      {v.testo}{v.fonte ? <span className="text-[10px] text-gray-400 dark:text-gray-500"> ({v.fonte})</span> : null}
    </li>
  );
  const Fonti = ({ fonti }: { fonti: { url: string; host: string; tier: 'A' | 'B' | 'C' }[] }) => fonti.length ? (
    <Sezione titolo={tr('mp_clima_sez_fonti')}>
      <ul>
        {fonti.map((f) => (
          <li key={f.url} className="text-[11px] leading-snug mb-1 truncate">
            <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-[#1e3a8a] dark:text-blue-300 underline">{f.host}</a>
            <span className="text-gray-400"> · {tierTesto(f.tier)}</span>
          </li>
        ))}
      </ul>
    </Sezione>
  ) : null;
  const mostraErrore = () => (
    <>
      {caricamento && (
        <div className="flex items-center gap-2 mt-5 text-[13px] text-gray-600 dark:text-gray-300">
          <Loader2 size={16} className="animate-spin shrink-0" /> {tr('mp_clima_report_attesa')}
        </div>
      )}
      {!caricamento && errore === 'accesso' && (
        <button type="button" onClick={() => { try { window.dispatchEvent(new CustomEvent('wip-auth-required', { detail: { url: '/api/meteo/clima/report' } })); } catch { /* niente */ } }}
          className="mt-5 w-full text-left rounded-2xl bg-blue-50 dark:bg-blue-900/30 px-4 py-3 text-[13px] font-bold text-[#1e3a8a] dark:text-blue-200">
          🔒 {tr('mp_clima_report_accedi')}
        </button>
      )}
      {!caricamento && errore === 'non_disponibile' && (
        <button type="button" onClick={() => setTentativo((n) => n + 1)} className="mt-5 w-full text-left rounded-2xl bg-orange-50 dark:bg-orange-900/30 px-4 py-3 text-[13px] text-orange-800 dark:text-orange-200">
          {tr('mp_clima_report_errore')}
        </button>
      )}
    </>
  );

  const scaricaPdf = async () => {
    if (!dati || pdfInCorso) return;
    setPdfInCorso(true);
    try {
      const [{ generaPdfClima }, { saveBlobAsFile }] = await Promise.all([import('../lib/pdf/generaPdf'), import('../services/premiumGuideService')]);
      const blob = await generaPdfClima(citta || `${lat.toFixed(2)}, ${lon.toFixed(2)}`, dati, modo === 'anno' ? report : null, modo === 'mese' ? reportMese : null, L);
      if (!blob) { notify(tr('mp_clima_pdf_non_riuscito')); return; }
      const nomeFile = `WIP - ${tr('mp_clima_report_titolo')} - ${citta || 'clima'}${modo === 'mese' ? ` - ${nomeMese(mese, L, true)}` : ''}.pdf`;
      await saveBlobAsFile(blob, nomeFile, { tipo: 'guida', nome: `${tr('mp_clima_report_titolo')} · ${citta}${modo === 'mese' ? ` · ${nomeMese(mese, L, true)}` : ''}` });
    } catch (e) { console.warn('[clima] pdf', e); notify(tr('mp_clima_pdf_non_riuscito')); }
    finally { setPdfInCorso(false); }
  };
  const ascolta = async () => {
    const testo = testoDaLeggere(citta, modo === 'anno' ? report : null, modo === 'mese' ? reportMese : null, L);
    if (!testo) return;
    try {
      const [{ speakAudioguide }, { getGuideCharacter }] = await Promise.all([import('../services/ttsService'), import('../lib/guideSettings')]);
      await speakAudioguide(testo, L, getGuideCharacter(), undefined, `${tr('mp_clima_report_titolo')} · ${citta}`);
    } catch (e) { console.warn('[clima] voce', e); }
  };
  const cercaConfronto = async () => {
    setConfrontoErr(false);
    const c = await cercaCitta(confrontoTesto, L);
    if (!c) { setConfrontoErr(true); return; }
    // Solo i numeri: questa scheda non mostra l'analisi AI della cella (niente Bearer, niente generazione).
    const d = await fetchDatiClima(c.lat, c.lon, L, true);
    if (!d) { setConfrontoErr(true); return; }
    setConfronto({ nome: c.label, dati: d });
  };

  const x = dati?.mesi.find((y) => y.m === mese) || null;
  const prima = dati?.mesi[(mese + 10) % 12] || null, dopo = dati?.mesi[mese % 12] || null;
  const s = report?.sezioni;
  const sm = reportMese?.sezioni;

  const sheet = (
    <div className="fixed inset-0 z-[10050] bg-black/45 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-lg bg-white dark:bg-[#1C1C1E] rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92dvh] flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-2 border-b border-black/5 dark:border-white/10">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">📅 {tr('mp_clima_report_titolo')}</p>
              <h2 className="text-lg font-black text-[#1e3a8a] dark:text-white leading-tight truncate">{citta || `${lat.toFixed(2)}, ${lon.toFixed(2)}`}</h2>
            </div>
            <button type="button" onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10" aria-label={getTranslation('close', lang)}>
              <X size={20} className="text-gray-500" />
            </button>
          </div>
          {/* Anno | Mese */}
          <div className="mt-2 flex gap-1 rounded-xl bg-black/5 dark:bg-white/10 p-1">
            {(['anno', 'mese'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setModo(k)} className={`flex-1 rounded-lg py-1.5 text-[12px] font-black ${modo === k ? 'bg-white dark:bg-[#2C2C2E] text-[#1e3a8a] dark:text-white shadow' : 'text-gray-500'}`}>
                {tr(k === 'anno' ? 'mp_clima_modo_anno' : 'mp_clima_modo_mese')}
              </button>
            ))}
          </div>
          {modo === 'mese' && dati && (
            <div className="mt-2 grid grid-cols-12 gap-1">
              {dati.mesi.map((y) => (
                <button key={y.m} type="button" onClick={() => setMese(y.m)} title={`${nomeMese(y.m, L, true)}: ${y.punteggio}/100`}
                  className={`rounded-md py-1 text-[10px] font-bold ${mese === y.m ? 'text-white' : 'text-gray-700 dark:text-gray-200 bg-black/5 dark:bg-white/10'}`}
                  style={mese === y.m ? { background: coloreClima(y.punteggio) } : undefined}>
                  {nomeMese(y.m, L).slice(0, 3)}
                </button>
              ))}
            </div>
          )}
          {/* Azioni: PDF, Ascolta, Confronta */}
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={scaricaPdf} disabled={!dati || pdfInCorso} className="flex-1 flex items-center justify-center gap-1 rounded-xl bg-[#1e3a8a] text-white text-[11px] font-black py-1.5 disabled:opacity-50">
              {pdfInCorso ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} {tr('mp_clima_pdf')}
            </button>
            <button type="button" onClick={ascolta} disabled={modo === 'anno' ? !report : !reportMese} className="flex-1 flex items-center justify-center gap-1 rounded-xl bg-amber-500 text-white text-[11px] font-black py-1.5 disabled:opacity-50">
              <Volume2 size={13} /> {tr('mp_clima_ascolta')}
            </button>
            <button type="button" onClick={() => setConfrontoAperto((v) => !v)} className="flex-1 flex items-center justify-center gap-1 rounded-xl bg-teal-600 text-white text-[11px] font-black py-1.5">
              <ArrowLeftRight size={13} /> {tr('mp_clima_confronta').split(' ')[0]}
            </button>
          </div>
          {confrontoAperto && (
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void cercaConfronto(); }}>
              <input value={confrontoTesto} onChange={(e) => setConfrontoTesto(e.target.value)} placeholder={tr('mp_clima_confronta_cerca')} className="flex-1 rounded-xl border border-black/10 dark:border-white/20 bg-white dark:bg-[#2C2C2E] px-3 py-1.5 text-[13px] text-gray-900 dark:text-white" />
              <button type="submit" className="rounded-xl bg-teal-600 text-white text-[12px] font-black px-3">OK</button>
            </form>
          )}
          {confrontoErr && <p className="text-[11px] text-orange-700 mt-1">{tr('mp_clima_confronta_non_trovata')}</p>}
        </div>

        <div className="overflow-y-auto px-5 pb-6" style={{ WebkitOverflowScrolling: 'touch' } as any}>
          {/* CONFRONTO: due città, 12 mesi, punteggio e numeri fianco a fianco. */}
          {confronto && dati && (
            <Sezione titolo={`${tr('mp_clima_confronta')}: ${citta} · ${confronto.nome}`}>
              <table className="w-full text-[11px]">
                <thead><tr className="text-[9px] uppercase text-gray-400"><th className="text-left py-1">{tr('mp_clima_col_mese')}</th><th className="text-right">{citta.slice(0, 12)}</th><th className="text-right">{confronto.nome.slice(0, 12)}</th></tr></thead>
                <tbody>
                  {dati.mesi.map((a, i) => { const b = confronto.dati.mesi[i]; return (
                    <tr key={a.m} className="border-t border-black/5 dark:border-white/10 text-gray-800 dark:text-gray-100">
                      <td className="py-1 font-bold">{nomeMese(a.m, L)}</td>
                      <td className="text-right"><span className="font-black" style={{ color: coloreClima(a.punteggio) }}>{a.punteggio}</span> · {a.tmax ?? '?'}° · {a.mm ?? '?'} mm</td>
                      <td className="text-right"><span className="font-black" style={{ color: coloreClima(b.punteggio) }}>{b.punteggio}</span> · {b.tmax ?? '?'}° · {b.mm ?? '?'} mm</td>
                    </tr>); })}
                </tbody>
              </table>
              <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-1">{tr('mp_clima_migliore')}: <b>{citta}</b> {testoPeriodi(dati.migliori, L)} · <b>{confronto.nome}</b> {testoPeriodi(confronto.dati.migliori, L)}</p>
            </Sezione>
          )}

          {/* ═══ MODO ANNO ═══ */}
          {modo === 'anno' && dati && (
            <>
              <p className="text-[12px] text-gray-600 dark:text-gray-300 mt-3">
                {tr('mp_clima_migliore')}: <b className="text-teal-700 dark:text-teal-300">{testoPeriodi(dati.migliori, L) || '—'}</b>
                {dati.peggiori.length > 0 && <> · {tr('mp_clima_evitare')}: {testoPeriodi(dati.peggiori, L)}</>}
              </p>
              <Sezione titolo={`${tr('mp_clima_sez_numeri')} · ${dati.attribuzione}`}>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[10px] uppercase text-gray-400">
                      <th className="text-left font-bold py-1">{tr('mp_clima_col_mese')}</th><th className="text-right font-bold">{tr('mp_clima_col_temp')}</th><th className="text-right font-bold">{tr('mp_clima_col_pioggia')}</th>
                      <th className="text-right font-bold">{tr('mp_clima_col_sole')}</th><th className="text-right font-bold">{tr('mp_clima_col_luce')}</th><th className="text-right font-bold">{tr('mp_clima_col_voto')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dati.mesi.map((y) => (
                      <tr key={y.m} className="border-t border-black/5 dark:border-white/10 text-gray-800 dark:text-gray-100 cursor-pointer" onClick={() => { setMese(y.m); setModo('mese'); }}>
                        <td className="py-1 font-bold">{nomeMese(y.m, L)}</td>
                        <td className="text-right">{y.tmin ?? '?'}° / {y.tmax ?? '?'}°</td>
                        <td className="text-right">{y.mm ?? '?'} mm</td>
                        <td className="text-right">{y.sole ?? '?'}</td>
                        <td className="text-right">{oreLuceMese(lat, y.m)} h</td>
                        <td className="text-right font-black" style={{ color: coloreClima(y.punteggio) }}>{y.punteggio} <span className="font-normal text-[10px]">{tr(`mp_clima_${livelloClima(y.punteggio)}`)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[10px] text-gray-400 mt-1">{tr('mp_clima_col_sole')}: kWh/m²/g · {tr('mp_clima_col_umidita')}: {dati.mesi.map((y) => `${nomeMese(y.m, L).slice(0, 1).toUpperCase()} ${y.umidita ?? '?'}%`).join(' ')}</p>
              </Sezione>

              {dati.mare && (
                <Sezione titolo={`${tr('mp_clima_sez_mare')} · ${dati.mare.attribuzione}`}>
                  <div className="flex gap-[3px] items-end h-9">
                    {dati.mare.mesi.map((y) => (
                      <div key={y.m} className="flex-1 flex flex-col items-center justify-end gap-0.5 h-full" title={`${nomeMese(y.m, L, true)}: ${y.t ?? '?'}°`}>
                        <span className="w-full rounded-sm" style={{ height: `${Math.max(4, ((y.t ?? 0) - 8) * 2)}px`, background: (y.t ?? 0) >= 22 ? '#0891b2' : '#94a3b8' }} />
                        <span className="text-[8px] text-gray-500">{nomeMese(y.m, L).slice(0, 1).toUpperCase()}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-700 dark:text-gray-200 mt-1">
                    🏖 {dati.mare.bagno.length ? `${testoPeriodi(dati.mare.bagno.reduce((acc: { da: number; a: number }[], m) => { const u = acc[acc.length - 1]; if (u && u.a === m - 1) u.a = m; else acc.push({ da: m, a: m }); return acc; }, []), L)} · ${tr('mp_clima_mare_acqua')} ${Math.max(...dati.mare.mesi.map((y) => y.t ?? 0))}°` : tr('mp_clima_mare_nessuno')}
                  </p>
                </Sezione>
              )}

              {dati.tendenza && (
                <Sezione titolo={tr('mp_clima_sez_tendenza')}>
                  <p className="text-[12px] text-gray-700 dark:text-gray-200 mb-1.5">
                    {tr('mp_clima_tendenza_media')}: <b>{dati.tendenza.deltaTMedio > 0 ? '+' : ''}{dati.tendenza.deltaTMedio}°</b>
                    {dati.tendenza.deltaMmPctMedio != null && <> · {tr('mp_clima_tendenza_pioggia')} <b>{dati.tendenza.deltaMmPctMedio > 0 ? '+' : ''}{dati.tendenza.deltaMmPctMedio}%</b></>}
                  </p>
                  <div className="flex gap-1">
                    {dati.tendenza.anni.map((a) => (
                      <div key={a.anno} className="flex-1 text-center rounded-lg bg-black/[0.04] dark:bg-white/10 py-1">
                        <p className="text-[9px] text-gray-500">{a.anno}</p>
                        <p className={`text-[11px] font-bold ${a.deltaT > 0.5 ? 'text-orange-600' : a.deltaT < -0.5 ? 'text-blue-600' : 'text-gray-800 dark:text-gray-100'}`}>{a.deltaT > 0 ? '+' : ''}{a.deltaT}°</p>
                        {a.deltaMmPct != null && <p className="text-[9px] text-gray-500">☔ {a.deltaMmPct > 0 ? '+' : ''}{a.deltaMmPct}%</p>}
                      </div>
                    ))}
                  </div>
                </Sezione>
              )}

              {adesso && adesso.giorni.length > 0 && (
                <Sezione titolo={`${tr('mp_clima_adesso')} · ${adesso.attribuzione}`}>
                  {adesso.deltaTmax != null && (
                    <p className="text-[12px] text-gray-700 dark:text-gray-200 mb-1.5">
                      🌡 {adesso.deltaTmax > 0 ? '+' : ''}{adesso.deltaTmax}° {tr(Math.abs(adesso.deltaTmax) < 1.5 ? 'mp_clima_nella_media' : adesso.deltaTmax > 0 ? 'mp_clima_sopra_media' : 'mp_clima_sotto_media')}
                      {adesso.mmAttesi != null && ` · ☔ ${adesso.mmPrevisti} mm ${tr('mp_clima_pioggia_prevista')} (${adesso.mmAttesi} mm ${tr('mp_clima_attesa_mese')})`}
                    </p>
                  )}
                  <div className="flex gap-1">
                    {adesso.giorni.map((g) => (
                      <div key={g.data} className="flex-1 text-center rounded-lg bg-black/[0.04] dark:bg-white/10 py-1">
                        <p className="text-[9px] text-gray-500">{new Date(g.data + 'T12:00:00').toLocaleDateString(L, { weekday: 'short' })}</p>
                        <p className="text-[11px] font-bold text-gray-800 dark:text-gray-100">{g.tmax == null ? '?' : Math.round(g.tmax)}°</p>
                        <p className="text-[9px] text-gray-500">{g.tmin == null ? '?' : Math.round(g.tmin)}°{g.mm >= 1 ? ` · ${Math.round(g.mm)}mm` : ''}</p>
                      </div>
                    ))}
                  </div>
                </Sezione>
              )}

              {mostraErrore()}
              {s && (
                <>
                  <Sezione titolo={tr('mp_clima_sez_panoramica')}><P>{s.panoramica}</P></Sezione>
                  <Sezione titolo={tr('mp_clima_migliore')}><P>{s.periodo_migliore}</P></Sezione>
                  {s.statistiche.length > 0 && (
                    <Sezione titolo={tr('mp_clima_sez_statistiche')}>
                      <ul className="grid grid-cols-1 gap-1">
                        {s.statistiche.map((y, i) => (
                          <li key={i} className="flex justify-between gap-3 text-[12px] border-b border-black/5 dark:border-white/10 py-1">
                            <span className="text-gray-500 dark:text-gray-400">{y.voce}</span><span className="font-bold text-gray-800 dark:text-gray-100 text-right">{y.valore}</span>
                          </li>
                        ))}
                      </ul>
                    </Sezione>
                  )}
                  <Sezione titolo={tr('mp_clima_sez_web')}>
                    {s.dal_web.length ? <ul className="list-disc pl-4">{s.dal_web.map(voce)}</ul> : <p className="text-[12px] text-gray-500">{tr('mp_clima_nessuna_pagina')}</p>}
                  </Sezione>
                  {s.esperienze.length > 0 && <Sezione titolo={tr('mp_clima_sez_esperienze')}><ul className="list-disc pl-4">{s.esperienze.map(voce)}</ul></Sezione>}
                  {s.mese_per_mese.length > 0 && (
                    <Sezione titolo={tr('mp_clima_sez_mesi')}>
                      <ul>
                        {s.mese_per_mese.map((y) => (
                          <li key={y.m} className="flex gap-2 text-[13px] leading-snug text-gray-800 dark:text-gray-100 mb-1.5 cursor-pointer" onClick={() => { setMese(y.m); setModo('mese'); }}>
                            <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: coloreClima(dati.mesi[y.m - 1]?.punteggio ?? 50) }} />
                            <span><b>{nomeMese(y.m, L, true)}</b>: {y.testo}</span>
                          </li>
                        ))}
                      </ul>
                    </Sezione>
                  )}
                  <Sezione titolo={tr('mp_clima_sez_portare')}><P>{s.cosa_portare}</P></Sezione>
                  <Sezione titolo={tr('mp_clima_sez_orari')}><P>{s.orari_migliori}</P></Sezione>
                  <Sezione titolo={tr('mp_clima_sez_avvertenze')}><P>{s.avvertenze}</P></Sezione>
                  {s.conclusioni && (
                    <Sezione titolo={tr('mp_clima_sez_conclusioni')}>
                      <p className="text-[13px] leading-snug text-gray-900 dark:text-white font-medium rounded-2xl bg-teal-50 dark:bg-teal-900/30 px-3 py-2.5">✨ {s.conclusioni}</p>
                    </Sezione>
                  )}
                  {report && <Fonti fonti={report.fontiWeb} />}
                </>
              )}
            </>
          )}

          {/* ═══ MODO MESE ═══ */}
          {modo === 'mese' && dati && x && (
            <>
              <div className="mt-3 flex items-center gap-3">
                <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-[16px] font-black shrink-0" style={{ background: coloreClima(x.punteggio) }}>{x.punteggio}</span>
                <div className="min-w-0">
                  <p className="text-[15px] font-black text-[#1e3a8a] dark:text-white leading-tight">{nomeMese(mese, L, true)} · {tr(`mp_clima_${livelloClima(x.punteggio)}`)}</p>
                  <p className="text-[11px] text-gray-600 dark:text-gray-300">{tr('mp_clima_classifica').replace('{n}', String(classificaMese(dati, mese)))}</p>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                {[
                  ['🌡', `${x.tmin ?? '?'}° / ${x.tmax ?? '?'}°`, tr('mp_clima_col_temp')],
                  ['☔', `${x.mm ?? '?'} mm`, tr('mp_clima_col_pioggia')],
                  ['☀️', `${x.sole ?? '?'}`, `${tr('mp_clima_col_sole')} kWh/m²/g`],
                  ['🕒', `${oreLuceMese(lat, mese)} h`, tr('mp_clima_col_luce')],
                  ['💧', `${x.umidita ?? '?'}%`, tr('mp_clima_col_umidita')],
                  ['🏖', dati.mare?.mesi[mese - 1]?.t != null ? `${dati.mare.mesi[mese - 1].t}°` : '—', tr('mp_clima_mare_acqua')],
                ].map(([ic, v, e], i) => (
                  <div key={i} className="rounded-xl bg-black/[0.04] dark:bg-white/10 py-1.5">
                    <p className="text-[13px] font-black text-gray-800 dark:text-gray-100">{ic} {v}</p>
                    <p className="text-[9px] text-gray-500">{e}</p>
                  </div>
                ))}
              </div>
              {prima && dopo && (
                <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-2 leading-snug">
                  ← {nomeMese(prima.m, L)}: {prima.tmax ?? '?'}° · {prima.mm ?? '?'} mm · <span style={{ color: coloreClima(prima.punteggio) }} className="font-bold">{prima.punteggio}</span>
                  &nbsp;&nbsp;·&nbsp;&nbsp;{nomeMese(dopo.m, L)}: {dopo.tmax ?? '?'}° · {dopo.mm ?? '?'} mm · <span style={{ color: coloreClima(dopo.punteggio) }} className="font-bold">{dopo.punteggio}</span> →
                </p>
              )}
              {mese === new Date().getMonth() + 1 && adesso && adesso.deltaTmax != null && (
                <p className="text-[11px] text-gray-700 dark:text-gray-200 mt-1.5">
                  🌡 {tr('mp_clima_adesso')}: {adesso.deltaTmax > 0 ? '+' : ''}{adesso.deltaTmax}° {tr(Math.abs(adesso.deltaTmax) < 1.5 ? 'mp_clima_nella_media' : adesso.deltaTmax > 0 ? 'mp_clima_sopra_media' : 'mp_clima_sotto_media')}
                </p>
              )}

              {mostraErrore()}
              {sm && (
                <>
                  <Sezione titolo={tr('mp_clima_sez_aspettarsi')}><P>{sm.cosa_aspettarsi}</P></Sezione>
                  <Sezione titolo={tr('mp_clima_sez_web')}>
                    {sm.dal_web.length ? <ul className="list-disc pl-4">{sm.dal_web.map(voce)}</ul> : <p className="text-[12px] text-gray-500">{tr('mp_clima_nessuna_pagina')}</p>}
                  </Sezione>
                  {sm.esperienze.length > 0 && <Sezione titolo={tr('mp_clima_sez_esperienze')}><ul className="list-disc pl-4">{sm.esperienze.map(voce)}</ul></Sezione>}
                  {sm.eventi.length > 0 && <Sezione titolo={tr('mp_clima_sez_eventi')}><ul className="list-disc pl-4">{sm.eventi.map(voce)}</ul></Sezione>}
                  <Sezione titolo={tr('mp_clima_sez_portare')}><P>{sm.cosa_portare}</P></Sezione>
                  <Sezione titolo={tr('mp_clima_sez_orari')}><P>{sm.orari_migliori}</P></Sezione>
                  {sm.alternativa && <Sezione titolo={tr('mp_clima_sez_alternativa')}><P>{sm.alternativa}</P></Sezione>}
                  {sm.conclusioni && (
                    <Sezione titolo={tr('mp_clima_sez_conclusioni')}>
                      <p className="text-[13px] leading-snug text-gray-900 dark:text-white font-medium rounded-2xl bg-teal-50 dark:bg-teal-900/30 px-3 py-2.5">✨ {sm.conclusioni}</p>
                    </Sezione>
                  )}
                  {reportMese && <Fonti fonti={reportMese.fontiWeb} />}
                </>
              )}
            </>
          )}
          {!dati && <p className="text-[12px] text-gray-500 mt-4">{tr('mp_clima_non_disp')}</p>}
        </div>
      </div>
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(sheet, document.body) : sheet;
}
