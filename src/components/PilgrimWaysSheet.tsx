// =====================================================================
// WIP · "Cammini e pellegrinaggi" (sheet a tutto schermo)
// Verticale contemplativa (toni verdi, ritmo lento): seed curato
// mondiale PILGRIM_ROUTES di src/lib/transitCatalog.ts con ricerca e
// filtri per continente/durata/difficoltà; se il seed non ha il cammino
// cercato, fallback AI GRATUITO su POST /api/transit-guide (kind
// 'pilgrim', badge 🤖 AI). Dettaglio con TABELLA tappe giorno-per-giorno
// (da → a, km, terreno, alloggio + dove si timbra) e "Prepara il
// cammino ✨" → pre-fill roadtrip con legs = le tappe (coordinate curate).
// «Attestato del cammino»: se l'utente ha un itinerario di QUEL cammino
// si mostra la barra tappe completate (check-in o passaggio fisico via
// visitedFog) e, a cammino finito, il bottone che genera l'attestato
// A4 via canvas (src/lib/pilgrimCertificate.ts) con codice verificabile.
// =====================================================================
import { X, Search, Loader2, Footprints, Stamp } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  PILGRIM_ROUTES, buildPilgrimPrefill,
  type PilgrimRoute, type PilgrimDifficulty, type RoutePrefill,
} from '../lib/transitCatalog';
import { getApiUrl } from '../lib/api';
import { supabase } from '../lib/supabase';
import {
  recordPilgrimActivation, getProgress, computeCertHash, renderCertificate,
  registerCertificate, shareOrDownloadCertificate,
  type PilgrimProgress, type CertificateData,
} from '../lib/pilgrimCertificate';

type DurataFiltro = 'tutte' | 'brevi' | 'lunghi';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const DIFF_LABEL: Record<PilgrimDifficulty, string> = {
  facile: '🟢 Facile', media: '🟡 Media', impegnativa: '🔴 Impegnativa',
};

export default function PilgrimWaysSheet({
  language = 'IT',
  onApply,
  onClose,
  onOpenLibrary,
}: {
  language?: string;
  onApply: (p: RoutePrefill) => void;
  onClose: () => void;
  /** 📚 Apre la Libreria itinerari pre-filtrata su questo cammino. */
  onOpenLibrary?: (pre: { kind: string; city?: string; query?: string }) => void;
}) {
  const [query, setQuery] = useState('');
  const [continente, setContinente] = useState('tutti');
  const [durata, setDurata] = useState<DurataFiltro>('tutte');
  const [difficolta, setDifficolta] = useState<'tutte' | PilgrimDifficulty>('tutte');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [aiRoutes, setAiRoutes] = useState<PilgrimRoute[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  // Itinerari dell'utente (per barra progresso e attestato): stessa
  // coppia di fonti di ProfileScreen — Supabase + mirror mock locale.
  const [myItineraries, setMyItineraries] = useState<any[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess?.session?.user?.id;
        let rows: any[] = [];
        if (uid) {
          const { data } = await supabase
            .from('user_itineraries')
            .select('id,titolo,created_at,updated_at,dati_itinerario')
            .eq('user_id', uid)
            .order('updated_at', { ascending: false })
            .limit(50);
          if (Array.isArray(data)) rows = data;
        }
        try {
          const local = JSON.parse(localStorage.getItem('mock_db_user_itineraries') || '[]');
          if (Array.isArray(local)) {
            for (const it of local) if (!rows.some(r => r.id === it?.id)) rows.push(it);
          }
        } catch { /* mirror locale assente/corrotto */ }
        if (alive) setMyItineraries(rows);
      } catch { /* offline: niente barra progresso, sheet comunque usabile */ }
    })();
    return () => { alive = false; };
  }, []);

  // Per ogni cammino, il progresso dell'itinerario utente PIÙ RECENTE
  // riconosciuto come quel cammino (check-in tappe + fog di passaggio).
  const progressByRoute = useMemo(() => {
    const map: Record<string, { itinerary: any; progress: PilgrimProgress }> = {};
    for (const it of myItineraries) {
      try {
        const p = getProgress(it);
        if (p && !map[p.routeId]) map[p.routeId] = { itinerary: it, progress: p };
      } catch { /* itinerario malformato: si ignora */ }
    }
    return map;
  }, [myItineraries]);

  const tutte = useMemo(() => [...PILGRIM_ROUTES, ...aiRoutes], [aiRoutes]);

  const continenti = useMemo(() => {
    const set = new Set<string>();
    for (const r of tutte) if (r.continent) set.add(r.continent);
    return [...set].sort((a, b) => a.localeCompare(b, 'it'));
  }, [tutte]);

  const q = norm(query.trim());
  const lista = useMemo(() => tutte.filter(r => {
    if (continente !== 'tutti' && r.continent !== continente) return false;
    if (durata === 'brevi' && r.days > 4) return false;
    if (durata === 'lunghi' && r.days <= 4) return false;
    if (difficolta !== 'tutte' && r.difficulty !== difficolta) return false;
    if (q.length >= 2 && !norm(`${r.name} ${r.start} ${r.end} ${r.country}`).includes(q)) return false;
    return true;
  }), [tutte, continente, durata, difficolta, q]);

  const generaAi = async () => {
    if (aiLoading || query.trim().length < 2) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch(getApiUrl('/api/transit-guide'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'pilgrim', query: query.trim(), lang: (language || 'IT').toLowerCase() }),
        signal: AbortSignal.timeout(120000),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.item?.id) {
        setAiError(data?.error || 'Cammino non disponibile in questo momento: riprova.');
        return;
      }
      const r = data.item as PilgrimRoute;
      setAiRoutes(prev => prev.some(x => x.id === r.id) ? prev : [...prev, r]);
      setExpandedId(r.id);
    } catch {
      setAiError('Rete assente o server occupato: riprova tra poco.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10002] bg-white flex flex-col">
      {/* Header — identità verde/contemplativa */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-emerald-100 bg-emerald-50/50 shrink-0">
        <h2 className="font-black text-emerald-800 text-lg">🥾 Cammini e pellegrinaggi</h2>
        <button onClick={onClose} className="p-2 rounded-full bg-white text-gray-400 hover:bg-gray-100 transition" aria-label="Chiudi">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Ricerca mondiale */}
      <div className="px-4 pt-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600/60" />
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setAiError(null); }}
            placeholder="Cerca un cammino nel mondo…"
            className="w-full pl-9 pr-4 py-3 rounded-2xl bg-emerald-50/60 border border-emerald-200/60 focus:border-emerald-500 outline-none text-sm font-medium"
          />
        </div>
        <p className="text-[10px] font-medium text-gray-400 mt-1 pl-1">
          Un passo alla volta: tappe, alloggi e timbri già pensati. La strada è la meta.
        </p>
      </div>

      {/* Filtri: continente, durata, difficoltà */}
      <div className="flex items-center gap-2 px-4 py-3 shrink-0 overflow-x-auto no-scrollbar">
        <select
          value={continente}
          onChange={e => setContinente(e.target.value)}
          className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black bg-white text-gray-500 border border-emerald-200/60 outline-none"
          aria-label="Filtra per continente"
        >
          <option value="tutti">🌍 Ovunque</option>
          {continenti.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {([
          { id: 'tutte' as DurataFiltro, label: 'Ogni durata' },
          { id: 'brevi' as DurataFiltro, label: '3-4 giorni' },
          { id: 'lunghi' as DurataFiltro, label: '5-7 giorni' },
        ]).map(d => (
          <button
            key={d.id}
            type="button"
            onClick={() => setDurata(d.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black transition-all border ${
              durata === d.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-500 border-emerald-200/60 hover:border-emerald-400'
            }`}
          >
            {d.label}
          </button>
        ))}
        {(['tutte', 'facile', 'media', 'impegnativa'] as const).map(d => (
          <button
            key={d}
            type="button"
            onClick={() => setDifficolta(d)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black transition-all border ${
              difficolta === d ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-500 border-emerald-200/60 hover:border-emerald-400'
            }`}
          >
            {d === 'tutte' ? 'Ogni passo' : DIFF_LABEL[d]}
          </button>
        ))}
      </div>

      {/* Lista cammini */}
      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-3">
        {lista.map(r => {
          const espansa = expandedId === r.id;
          const totKm = r.stages.reduce((acc, s) => acc + (s.km || 0), 0);
          return (
            <div
              key={r.id}
              className={`bg-white border rounded-2xl shadow-sm transition-all ${
                espansa ? 'border-emerald-400/60 shadow-md' : 'border-emerald-100 hover:border-emerald-300'
              }`}
            >
              <button
                type="button"
                onClick={() => setExpandedId(espansa ? null : r.id)}
                className="w-full text-left p-3 active:scale-[0.99] transition-transform"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl shrink-0">{r.emoji}</span>
                    <div className="min-w-0">
                      <div className="text-xs font-black text-emerald-800 leading-tight">{r.name}</div>
                      <div className="text-[10px] font-bold text-gray-500 mt-0.5">
                        {r.country} · {r.days} giorni · ~{totKm} km · {DIFF_LABEL[r.difficulty] || r.difficulty}
                      </div>
                    </div>
                  </div>
                  <span className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                    r.aiGenerated ? 'bg-gray-100 text-gray-500' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {r.aiGenerated ? '🤖 AI' : '✦ Redazione'}
                  </span>
                </div>
              </button>

              {espansa && (
                <div className="px-3 pb-3 space-y-3">
                  {/* Tabella tappe giorno-per-giorno */}
                  <div className="overflow-x-auto rounded-xl border border-emerald-100">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="bg-emerald-50 text-emerald-800">
                          <th className="text-left font-black px-2 py-1.5">G</th>
                          <th className="text-left font-black px-2 py-1.5">Tappa</th>
                          <th className="text-right font-black px-2 py-1.5">km</th>
                          <th className="text-left font-black px-2 py-1.5">Terreno</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.stages.map(s => (
                          <React.Fragment key={s.day}>
                            <tr className="border-t border-emerald-50">
                              <td className="px-2 py-1.5 font-black text-emerald-700 align-top">{s.day}</td>
                              <td className="px-2 py-1.5 font-bold text-gray-700 align-top">
                                {s.from} → {s.to}
                                {s.note && <div className="font-medium text-gray-400 mt-0.5">{s.note}</div>}
                              </td>
                              <td className="px-2 py-1.5 text-right font-black text-gray-600 align-top">{s.km}</td>
                              <td className="px-2 py-1.5 font-medium text-gray-500 align-top">{s.terrain || 'collinare'}</td>
                            </tr>
                            {s.lodging && (
                              <tr>
                                <td />
                                <td colSpan={3} className="px-2 pb-1.5 text-[9.5px] font-medium text-emerald-700/80">
                                  🛏 {s.lodging}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Credenziale */}
                  {r.credential && (
                    <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                      <Stamp className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600" />
                      <p className="text-[11px] font-bold text-emerald-800 leading-snug">
                        <span className="font-black">Credenziale: </span>{r.credential}
                      </p>
                    </div>
                  )}

                  {/* Periodo, difficoltà, bagaglio */}
                  <p className="text-[11px] text-gray-600 leading-relaxed">{r.notes}</p>

                  {/* «Attestato del cammino»: progresso dell'itinerario
                      attivo di QUESTO cammino (check-in o fog ~500 m) */}
                  {(() => {
                    const m = progressByRoute[r.id];
                    if (!m) return null;
                    const pct = Math.round((m.progress.stagesDone / Math.max(1, m.progress.stagesTotal)) * 100);
                    return (
                      <div className="bg-white border border-emerald-200 rounded-xl px-3 py-2.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-black text-emerald-800">
                            🥾 {m.progress.stagesDone}/{m.progress.stagesTotal} tappe completate
                          </span>
                          {m.progress.completed && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                              Cammino completato 🎉
                            </span>
                          )}
                        </div>
                        <div className="h-2 rounded-full bg-emerald-100 overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <PilgrimCertificateAction itinerary={m.itinerary} />
                      </div>
                    );
                  })()}

                  <button
                    type="button"
                    onClick={() => {
                      // Marcatore di attivazione: snapshot locale del cammino
                      // (riconoscimento futuro) + pilgrimRouteId nel prefill,
                      // così chi lo persiste può marcare dati_itinerario.
                      recordPilgrimActivation(r);
                      onApply({ ...buildPilgrimPrefill(r), pilgrimRouteId: r.id } as RoutePrefill);
                    }}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black active:scale-95 transition-transform flex items-center justify-center gap-1.5"
                  >
                    <Footprints className="w-3.5 h-3.5" /> Prepara il cammino ✨
                  </button>

                  {/* 📚 Libreria: itinerari già generati e verificati per
                      questo cammino (gratis, nessuna generazione) */}
                  {onOpenLibrary && (
                    <button
                      type="button"
                      onClick={() => onOpenLibrary({ kind: 'pilgrim', city: r.start, query: r.name })}
                      className="w-full py-2 rounded-xl border border-amber-300/70 bg-amber-50 text-amber-800 text-[11px] font-black hover:bg-amber-100 active:scale-95 transition"
                    >
                      📚 Vedi gli itinerari pronti per questo cammino
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Nessun match → fallback AI mondiale */}
        {lista.length === 0 && q.length >= 2 && (
          <div className="text-center py-8 space-y-3">
            <p className="text-xs font-bold text-gray-400">
              "{query.trim()}" non è tra i cammini curati.
            </p>
            {aiLoading ? (
              <div className="flex items-center justify-center gap-2 text-[11px] font-bold text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> La redazione AI traccia le tappe…
              </div>
            ) : (
              <button
                type="button"
                onClick={generaAi}
                className="px-5 py-2.5 rounded-full border border-emerald-400/60 text-emerald-700 text-xs font-black hover:bg-emerald-50 active:scale-95 transition"
              >
                🔍 Genera la guida del cammino "{query.trim()}" con l'AI
              </button>
            )}
            {aiError && <p className="text-[11px] font-bold text-red-400">{aiError}</p>}
          </div>
        )}
        {lista.length === 0 && q.length < 2 && (
          <p className="text-center text-xs font-bold text-gray-400 py-10">
            Nessun cammino per questi filtri: allarga la ricerca.
          </p>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// 🎓 Attestato del Pellegrino — bottone + sheet di anteprima
// Si nasconde da sé se l'itinerario non è un cammino COMPLETATO
// (getProgress: check-in tappe o passaggio fisico via visitedFog).
// Riusato da ProfileScreen sulle card degli itinerari-cammino.
// =====================================================================
export function PilgrimCertificateAction({ itinerary }: { itinerary: any }) {
  const progress = useMemo(() => {
    try { return getProgress(itinerary); } catch { return null; }
  }, [itinerary]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ url: string; data: CertificateData } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  if (!progress?.completed) return null;

  const genera = async () => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const user: any = sess?.session?.user;
      const userName = user?.user_metadata?.display_name
        || user?.user_metadata?.full_name
        || 'Viaggiatore WIP';
      const dateISO = progress.dates.end || new Date().toISOString().slice(0, 10);
      const code = await computeCertHash(user?.id || 'anon', progress.routeId, dateISO);
      const data: CertificateData = {
        userName,
        routeName: progress.name,
        km: progress.km,
        stages: progress.stagesTotal,
        dates: progress.dates,
        code,
      };
      const canvas = renderCertificate(data);
      canvasRef.current = canvas;
      setPreview({ url: canvas.toDataURL('image/png'), data });
      // Registrazione verificabile su wip.guide: best-effort, mai bloccante
      void registerCertificate(progress, code, sess?.session?.access_token);
    } catch {
      setFeedback('Generazione non riuscita: riprova.');
    } finally {
      setBusy(false);
    }
  };

  const esporta = async (forceDownload: boolean) => {
    if (!canvasRef.current || !preview) return;
    try {
      const esito = await shareOrDownloadCertificate(canvasRef.current, preview.data, forceDownload);
      if (esito === 'downloaded') setFeedback('PNG scaricato: incornicialo dove vuoi! 🖼');
    } catch (e: any) {
      // Condivisione annullata dall'utente: nessun errore da mostrare
      if (e?.name !== 'AbortError') setFeedback('Condivisione non riuscita: prova con "Scarica PNG".');
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={genera}
        disabled={busy}
        className="w-full py-2.5 rounded-xl bg-amber-500 text-white text-xs font-black active:scale-95 transition-transform flex items-center justify-center gap-1.5 disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '🎓'} Genera il tuo attestato
      </button>
      {feedback && !preview && <p className="text-[10px] font-bold text-gray-400 text-center">{feedback}</p>}

      {preview && (
        <div
          className="fixed inset-0 z-[10005] bg-black/60 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-white rounded-2xl p-4 w-full max-w-2xl space-y-3 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-emerald-800">🎓 Attestato del Pellegrino</h3>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="p-2 rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 transition"
                aria-label="Chiudi"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={preview.url}
              alt={`Attestato del cammino ${preview.data.routeName}`}
              className="w-full rounded-lg border border-amber-200 shadow-sm"
            />
            <p className="text-[10px] font-bold text-gray-400 text-center">
              Codice di verifica <span className="font-black text-amber-700">{preview.data.code}</span> · verificabile su wip.guide
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => esporta(false)}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black active:scale-95 transition"
              >
                📤 Condividi
              </button>
              <button
                type="button"
                onClick={() => esporta(true)}
                className="flex-1 py-2.5 rounded-xl border border-emerald-300 text-emerald-700 text-xs font-black hover:bg-emerald-50 active:scale-95 transition"
              >
                ⬇️ Scarica PNG
              </button>
            </div>
            {feedback && <p className="text-[10px] font-bold text-gray-400 text-center">{feedback}</p>}
          </div>
        </div>
      )}
    </>
  );
}
