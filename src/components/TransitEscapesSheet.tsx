// =====================================================================
// WIP · "Sosta breve: porti & aeroporti" (sheet a tutto schermo)
// Verticale per chi ha le ORE contate: seed curato mondiale di
// src/lib/transitCatalog.ts (CRUISE_PORTS + AIRPORT_LAYOVERS) con
// ricerca; se il seed non ha la località, fallback AI GRATUITO su
// POST /api/transit-guide (stessa struttura, badge 🤖 AI).
// Card → scelta ore di sosta → banner ambra col vincolo di rientro
// NON negoziabile → anteprima tappe → "Usa questo itinerario ✨"
// pre-compila il form del planner (1 giorno, vincolo in durata).
// =====================================================================
import { X, Search, Loader2, Anchor, Plane, Luggage } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import {
  CRUISE_PORTS, AIRPORT_LAYOVERS,
  buildPortPrefill, buildLayoverPrefill,
  type CruisePort, type AirportLayover, type StopOption, type StopPrefill,
} from '../lib/transitCatalog';
import { getApiUrl } from '../lib/api';

type Filtro = 'tutti' | 'porti' | 'aeroporti';

/** Voce unificata della lista (porto o aeroporto). */
type Voce =
  | { kind: 'port'; data: CruisePort }
  | { kind: 'airport'; data: AirportLayover };

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function matches(v: Voce, q: string): boolean {
  const t = v.kind === 'port'
    ? `${v.data.port} ${v.data.city} ${v.data.country}`
    : `${v.data.airport} ${v.data.code} ${v.data.city} ${v.data.country}`;
  return norm(t).includes(q);
}

export default function TransitEscapesSheet({
  language = 'IT',
  onApply,
  onClose,
  onOpenLibrary,
}: {
  language?: string;
  onApply: (p: StopPrefill) => void;
  onClose: () => void;
  /** 📚 Apre la Libreria itinerari pre-filtrata su questo porto/aeroporto. */
  onOpenLibrary?: (pre: { kind: string; city: string; query?: string }) => void;
}) {
  const [filtro, setFiltro] = useState<Filtro>('tutti');
  const [paese, setPaese] = useState('tutti');
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedHours, setSelectedHours] = useState<Record<string, number>>({});
  // Risultati AI della sessione (si sommano al seed, badge 🤖 AI)
  const [aiVoci, setAiVoci] = useState<Voce[]>([]);
  const [aiLoading, setAiLoading] = useState<'port' | 'airport' | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const tutte: Voce[] = useMemo(() => [
    ...CRUISE_PORTS.map(p => ({ kind: 'port' as const, data: p })),
    ...AIRPORT_LAYOVERS.map(a => ({ kind: 'airport' as const, data: a })),
    ...aiVoci,
  ], [aiVoci]);

  const paesi = useMemo(() => {
    const set = new Set<string>();
    for (const v of tutte) if (v.data.country) set.add(v.data.country);
    return [...set].sort((a, b) => a.localeCompare(b, 'it'));
  }, [tutte]);

  const q = norm(query.trim());
  const lista = useMemo(() => tutte.filter(v => {
    if (filtro === 'porti' && v.kind !== 'port') return false;
    if (filtro === 'aeroporti' && v.kind !== 'airport') return false;
    if (paese !== 'tutti' && v.data.country !== paese) return false;
    if (q.length >= 2 && !matches(v, q)) return false;
    return true;
  }), [tutte, filtro, paese, q]);

  const generaAi = async (kind: 'port' | 'airport') => {
    if (aiLoading || query.trim().length < 2) return;
    setAiLoading(kind);
    setAiError(null);
    try {
      const res = await fetch(getApiUrl('/api/transit-guide'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, query: query.trim(), lang: (language || 'IT').toLowerCase() }),
        signal: AbortSignal.timeout(90000),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.item?.id) {
        setAiError(data?.error || 'Guida non disponibile in questo momento: riprova.');
        return;
      }
      const voce: Voce = kind === 'port'
        ? { kind: 'port', data: data.item as CruisePort }
        : { kind: 'airport', data: data.item as AirportLayover };
      setAiVoci(prev => prev.some(v => v.data.id === data.item.id) ? prev : [...prev, voce]);
      setExpandedId(data.item.id);
    } catch {
      setAiError('Rete assente o server occupato: riprova tra poco.');
    } finally {
      setAiLoading(null);
    }
  };

  const apri = (id: string) => setExpandedId(expandedId === id ? null : id);

  /** Option attiva di una voce (default: la prima). */
  const optionAttiva = (v: Voce): StopOption => {
    const h = selectedHours[v.data.id];
    return v.data.options.find(o => o.hours === h) || v.data.options[0];
  };

  const usa = (v: Voce) => {
    const o = optionAttiva(v);
    onApply(v.kind === 'port' ? buildPortPrefill(v.data, o) : buildLayoverPrefill(v.data, o));
  };

  return (
    <div className="fixed inset-0 z-[10002] bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
        <h2 className="font-black text-primary text-lg">🛳✈️ Sosta breve</h2>
        <button onClick={onClose} className="p-2 rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 transition" aria-label="Chiudi">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Ricerca mondiale prominente */}
      <div className="px-4 pt-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setAiError(null); }}
            placeholder="Cerca porto o aeroporto in tutto il mondo…"
            className="w-full pl-9 pr-4 py-3 rounded-2xl bg-gray-50 border border-outline-variant/30 focus:border-primary outline-none text-sm font-medium"
          />
        </div>
        <p className="text-[10px] font-medium text-gray-400 mt-1 pl-1">
          Escursioni con le ore contate: rientro alla nave o al gate sempre garantito.
        </p>
      </div>

      {/* Filtri: tipo + paese */}
      <div className="flex items-center gap-2 px-4 py-3 shrink-0 overflow-x-auto no-scrollbar">
        {([
          { id: 'tutti' as Filtro, label: 'Tutti' },
          { id: 'porti' as Filtro, label: '🛳 Porti' },
          { id: 'aeroporti' as Filtro, label: '✈️ Aeroporti' },
        ]).map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => setFiltro(c.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black transition-all border ${
              filtro === c.id ? 'bg-primary text-white border-primary' : 'bg-white text-gray-500 border-outline-variant/30 hover:border-primary/30'
            }`}
          >
            {c.label}
          </button>
        ))}
        <select
          value={paese}
          onChange={e => setPaese(e.target.value)}
          className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black bg-white text-gray-500 border border-outline-variant/30 outline-none"
          aria-label="Filtra per paese"
        >
          <option value="tutti">🌍 Tutti i paesi</option>
          {paesi.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-3">
        {lista.map(v => {
          const espansa = expandedId === v.data.id;
          const o = optionAttiva(v);
          const isPort = v.kind === 'port';
          const rientroOre = isPort ? Math.max(1, o.hours - 1) : Math.max(1, o.hours - 2);
          return (
            <div
              key={v.data.id}
              className={`bg-white border rounded-2xl shadow-sm transition-all ${
                espansa ? 'border-primary/40 shadow-md' : 'border-outline-variant/20 hover:border-primary/30'
              }`}
            >
              <button type="button" onClick={() => apri(v.data.id)} className="w-full text-left p-3 active:scale-[0.99] transition-transform">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl shrink-0">{isPort ? (v.data as CruisePort).emoji : '✈️'}</span>
                    <div className="min-w-0">
                      <div className="text-xs font-black text-primary leading-tight truncate">
                        {isPort ? (v.data as CruisePort).port : `${(v.data as AirportLayover).airport} (${(v.data as AirportLayover).code})`}
                      </div>
                      <div className="text-[10px] font-bold text-gray-500 mt-0.5">
                        {v.data.city} · {v.data.country}
                        {!isPort && ` · città da ${(v.data as AirportLayover).minLayoverForCity}h+ di scalo`}
                      </div>
                    </div>
                  </div>
                  <span className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                    v.data.aiGenerated ? 'bg-gray-100 text-gray-500' : 'bg-primary/10 text-primary'
                  }`}>
                    {v.data.aiGenerated ? '🤖 AI' : '✦ Redazione'}
                  </span>
                </div>
              </button>

              {espansa && (
                <div className="px-3 pb-3 space-y-3">
                  {/* Trasferimento + bagagli */}
                  <div className="bg-gray-50 rounded-xl p-2.5 space-y-1.5">
                    <p className="text-[11px] text-gray-600 leading-relaxed">
                      <span className="font-black text-gray-700">🚌 Verso il centro: </span>{v.data.transferNote}
                    </p>
                    {!isPort && (
                      <p className="text-[11px] text-gray-600 leading-relaxed flex items-start gap-1">
                        <Luggage className="w-3 h-3 mt-0.5 shrink-0 text-gray-400" />
                        <span>{(v.data as AirportLayover).luggageNote || 'Deposito bagagli: verifica in loco il punto left luggage del terminal prima di uscire.'}</span>
                      </p>
                    )}
                  </div>

                  {/* Scelta ore di sosta */}
                  <div>
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1.5">
                      {isPort ? '⏱ Ore di sosta a terra' : '⏱ Ore di scalo'}
                    </p>
                    <div className="flex gap-2">
                      {v.data.options.map(opt => (
                        <button
                          key={opt.hours}
                          type="button"
                          onClick={() => setSelectedHours(prev => ({ ...prev, [v.data.id]: opt.hours }))}
                          className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all border ${
                            o.hours === opt.hours
                              ? 'bg-primary text-white border-primary'
                              : 'bg-white text-gray-500 border-outline-variant/30 hover:border-primary/30'
                          }`}
                        >
                          {opt.hours}h{opt.stayNearAirport ? ' 🛋' : ''}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Vincolo di rientro SEMPRE in evidenza */}
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    {isPort
                      ? <Anchor className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
                      : <Plane className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />}
                    <p className="text-[11px] font-bold text-amber-800 leading-snug">
                      {isPort
                        ? <>Rientro a bordo entro <span className="font-black">{rientroOre} ore</span> dall'inizio della sosta (1h di margine: la nave non aspetta).</>
                        : o.stayNearAirport
                          ? <>Si resta in aeroporto: al gate <span className="font-black">2 ore</span> prima del volo, senza stress.</>
                          : <>Ritorno in aeroporto entro <span className="font-black">{rientroOre} ore</span> dall'inizio dello scalo (2h prima del volo per controlli e imbarco).</>}
                    </p>
                  </div>

                  {/* Anteprima tappe della variante scelta */}
                  <div>
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">{o.title}</p>
                    <ol className="space-y-1">
                      {o.outline.map((tappa, i) => (
                        <li key={i} className="flex items-start gap-2 text-[11px] text-gray-600 leading-snug">
                          <span className="shrink-0 w-4 h-4 rounded-full bg-primary/10 text-primary text-[9px] font-black flex items-center justify-center mt-0.5">{i + 1}</span>
                          {tappa}
                        </li>
                      ))}
                    </ol>
                    {o.notes && <p className="text-[10px] text-gray-400 font-medium mt-1.5 leading-snug">{o.notes}</p>}
                  </div>

                  <button
                    type="button"
                    onClick={() => usa(v)}
                    className="w-full py-2.5 rounded-xl bg-primary text-white text-xs font-black active:scale-95 transition-transform"
                  >
                    Usa questo itinerario ✨
                  </button>

                  {/* 📚 Libreria: varianti già generate e verificate per
                      questa località (gratis, nessuna generazione) */}
                  {onOpenLibrary && (
                    <button
                      type="button"
                      onClick={() => onOpenLibrary({
                        kind: isPort ? 'port' : 'airport',
                        city: v.data.city,
                        query: v.data.city,
                      })}
                      className="w-full py-2 rounded-xl border border-amber-300/70 bg-amber-50 text-amber-800 text-[11px] font-black hover:bg-amber-100 active:scale-95 transition"
                    >
                      📚 Vedi gli itinerari pronti per questo {isPort ? 'porto' : 'aeroporto'}
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
              "{query.trim()}" non è nel catalogo curato.
            </p>
            {aiLoading ? (
              <div className="flex items-center justify-center gap-2 text-[11px] font-bold text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> La redazione AI prepara la guida…
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                {(filtro === 'tutti' || filtro === 'porti') && (
                  <button
                    type="button"
                    onClick={() => generaAi('port')}
                    className="px-5 py-2.5 rounded-full border border-primary/30 text-primary text-xs font-black hover:bg-primary/5 active:scale-95 transition"
                  >
                    🔍 Genera la guida del porto "{query.trim()}" con l'AI
                  </button>
                )}
                {(filtro === 'tutti' || filtro === 'aeroporti') && (
                  <button
                    type="button"
                    onClick={() => generaAi('airport')}
                    className="px-5 py-2.5 rounded-full border border-primary/30 text-primary text-xs font-black hover:bg-primary/5 active:scale-95 transition"
                  >
                    🔍 Genera la guida dell'aeroporto "{query.trim()}" con l'AI
                  </button>
                )}
              </div>
            )}
            {aiError && <p className="text-[11px] font-bold text-red-400">{aiError}</p>}
          </div>
        )}
        {lista.length === 0 && q.length < 2 && (
          <p className="text-center text-xs font-bold text-gray-400 py-10">
            Nessuna voce per questo filtro: prova un altro paese o cerca per nome.
          </p>
        )}
      </div>
    </div>
  );
}
