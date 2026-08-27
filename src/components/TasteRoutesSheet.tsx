// =====================================================================
// WIP · "Strade del vino e del gusto" (sheet a tutto schermo)
//
// Il gemello enogastronomico di PilgrimWaysSheet, e sta accanto a quello
// per una ragione precisa: anche qui il percorso ESISTE GIÀ, con le sue
// tappe in ordine, e il valore è seguirlo — non farselo inventare.
// Cambia il colore (bordeaux invece del verde contemplativo) e cambia
// l'avvertenza: sui cammini si consiglia l'acqua, qui si ricorda che chi
// degusta non guida.
//
// Il catalogo (src/lib/wineRoutesCatalog.ts) è curato a mano perché su
// OpenStreetMap le grandi strade del vino non esistono come relazione:
// 156 in tutto il pianeta, 126 fra Germania e Austria. I PRODUTTORI
// invece non sono qui: quelli arrivano dai 199.280 luoghi del gusto
// importati in shared_pois, e li pesca il generatore.
// =====================================================================
import { X, Search, Wine } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import {
  TASTE_ROUTES, TASTE_KIND_LABELS, buildTastePrefill,
  type TasteRoute, type TasteRouteKind,
} from '../lib/wineRoutesCatalog';
import {
  FOOD_FESTIVALS, FESTIVAL_KIND_LABELS, festivalsInMonth,
  type FoodFestival,
} from '../lib/foodFestivalsCatalog';
import type { RoutePrefill } from '../lib/transitCatalog';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const TRASPORTO_LABEL: Record<TasteRoute['transport'], string> = {
  auto: '🚗 in auto',
  bici: '🚲 in bici',
  treno: '🚆 in treno',
  piedi: '🥾 a piedi',
  navetta: '🚐 in navetta',
  barca: '⛴ in barca',
};

export default function TasteRoutesSheet({
  language = 'IT',
  onApply,
  onClose,
  onOpenLibrary,
}: {
  language?: string;
  onApply: (p: RoutePrefill) => void;
  onClose: () => void;
  /** 📚 Apre la Libreria itinerari pre-filtrata su questa strada. */
  onOpenLibrary?: (pre: { kind: string; city?: string; query?: string }) => void;
}) {
  const [scheda, setScheda] = useState<'percorsi' | 'fiere'>('percorsi');
  const [query, setQuery] = useState('');
  const [continente, setContinente] = useState('tutti');
  const [genere, setGenere] = useState<'tutti' | TasteRouteKind>('tutti');
  const [senzaAuto, setSenzaAuto] = useState(false);
  const [soloAdesso, setSoloAdesso] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const meseCorrente = new Date().getMonth() + 1;
  const fiere = useMemo(() => {
    const qq = norm(query.trim());
    const base = soloAdesso ? festivalsInMonth(meseCorrente) : FOOD_FESTIVALS;
    return base.filter((f) => {
      if (continente !== 'tutti' && f.continent !== continente) return false;
      if (qq.length >= 2 && !norm(`${f.name} ${f.city} ${f.country} ${f.what}`).includes(qq)) return false;
      return true;
    // Le fiere che cadono adesso vengono prima: è l'informazione che serve.
    }).sort((a, b) => {
      const aOra = a.months.includes(meseCorrente) ? 0 : 1;
      const bOra = b.months.includes(meseCorrente) ? 0 : 1;
      return aOra - bOra || a.name.localeCompare(b.name, 'it');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloAdesso, continente, query, meseCorrente]);

  const continenti = useMemo(() => {
    const set = new Set<string>();
    for (const r of TASTE_ROUTES) set.add(r.continent);
    return [...set].sort((a, b) => a.localeCompare(b, 'it'));
  }, []);

  const generi = useMemo(() => {
    const set = new Set<TasteRouteKind>();
    for (const r of TASTE_ROUTES) set.add(r.kind);
    return [...set];
  }, []);

  const q = norm(query.trim());
  const lista = useMemo(() => TASTE_ROUTES.filter((r) => {
    if (continente !== 'tutti' && r.continent !== continente) return false;
    if (genere !== 'tutti' && r.kind !== genere) return false;
    // Il filtro che nessun'altra guida offre e che qui serve davvero: le
    // strade percorribili SENZA guidare, cioè quelle in cui si può bere.
    if (senzaAuto && r.transport === 'auto') return false;
    if (q.length >= 2 && !norm(`${r.name} ${r.region} ${r.country} ${r.products}`).includes(q)) return false;
    return true;
  }), [continente, genere, senzaAuto, q]);

  return (
    <div className="fixed inset-0 z-[10002] bg-white flex flex-col">
      {/* Header — identità bordeaux */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-red-100 bg-red-50/50 shrink-0">
        <h2 className="font-black text-[#7f1d1d] text-lg">🍷 Strade del vino e del gusto</h2>
        <button onClick={onClose} className="p-2 rounded-full bg-white text-gray-400 hover:bg-gray-100 transition" aria-label="Chiudi">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Due schede: i percorsi si fanno quando vuoi, le fiere hanno una
          data e sono il motivo per cui si parte in QUELLA settimana. */}
      <div className="flex gap-1.5 px-4 pt-3 shrink-0">
        {([
          { id: 'percorsi' as const, label: `🛣 Percorsi (${TASTE_ROUTES.length})` },
          { id: 'fiere' as const, label: `🎪 Fiere e sagre (${FOOD_FESTIVALS.length})` },
        ]).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setScheda(t.id); setExpandedId(null); }}
            className={`flex-1 py-2 rounded-xl text-[11px] font-black transition-all border ${
              scheda === t.id
                ? 'bg-[#7f1d1d] text-white border-[#7f1d1d]'
                : 'bg-white text-gray-500 border-red-200/60 hover:border-red-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Ricerca mondiale */}
      <div className="px-4 pt-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-700/50" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={scheda === 'percorsi'
              ? 'Cerca una strada, un vitigno, un prodotto…'
              : 'Cerca una fiera, una sagra, un prodotto…'}
            className="w-full pl-9 pr-4 py-3 rounded-2xl bg-red-50/60 border border-red-200/60 focus:border-[#7f1d1d] outline-none text-sm font-medium"
          />
        </div>
        <p className="text-[10px] font-medium text-gray-400 mt-1 pl-1">
          {scheda === 'percorsi'
            ? `${TASTE_ROUTES.length} percorsi nel mondo: dove il prodotto nasce, non dove lo si compra.`
            : 'Le date cambiano ogni anno: qui c\'è la finestra giusta, il calendario si verifica sul sito ufficiale.'}
        </p>
      </div>

      {/* Filtri fiere: continente e "cosa c'è adesso" */}
      {scheda === 'fiere' && (
        <div className="flex items-center gap-2 px-4 py-3 shrink-0 overflow-x-auto no-scrollbar">
          <select
            value={continente}
            onChange={(e) => setContinente(e.target.value)}
            className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black bg-white text-gray-500 border border-red-200/60 outline-none"
            aria-label="Filtra per continente"
          >
            <option value="tutti">🌍 Ovunque</option>
            {continenti.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setSoloAdesso((v) => !v)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black transition-all border ${
              soloAdesso ? 'bg-[#7f1d1d] text-white border-[#7f1d1d]' : 'bg-white text-gray-500 border-red-200/60 hover:border-red-400'
            }`}
          >
            📅 Solo questo mese
          </button>
        </div>
      )}

      {/* Lista fiere */}
      {scheda === 'fiere' && (
        <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-3">
          {fiere.map((f: FoodFestival) => {
            const espansa = expandedId === f.id;
            const adesso = f.months.includes(meseCorrente);
            return (
              <div
                key={f.id}
                className={`bg-white border rounded-2xl shadow-sm transition-all ${
                  espansa ? 'border-red-400/60 shadow-md' : 'border-red-100 hover:border-red-300'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(espansa ? null : f.id)}
                  className="w-full text-left p-3 active:scale-[0.99] transition-transform"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xl shrink-0">{f.emoji}</span>
                      <div className="min-w-0">
                        <div className="text-xs font-black text-[#7f1d1d] leading-tight">{f.name}</div>
                        <div className="text-[10px] font-bold text-gray-500 mt-0.5">
                          {f.city}, {f.country}
                          {f.since ? ` · dal ${f.since}` : ''}
                        </div>
                      </div>
                    </div>
                    {adesso && (
                      <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        ● Adesso
                      </span>
                    )}
                  </div>
                </button>

                {espansa && (
                  <div className="px-3 pb-3 space-y-2.5">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      <p className="text-[11px] font-black text-amber-900 leading-snug">🗓 {f.when}</p>
                      <p className="text-[9.5px] font-bold text-amber-700/80 mt-1">
                        Le date esatte cambiano ogni anno: verifica sul sito ufficiale prima di prenotare.
                      </p>
                    </div>
                    <p className="text-[11px] text-gray-700 leading-relaxed">{f.what}</p>
                    <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                      <p className="text-[11px] font-bold text-[#7f1d1d] leading-snug">💡 {f.tip}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-red-100 text-[#7f1d1d]">
                        {FESTIVAL_KIND_LABELS[f.kind].emoji} {FESTIVAL_KIND_LABELS[f.kind].label}
                      </span>
                    </div>
                    {onOpenLibrary && (
                      <button
                        type="button"
                        onClick={() => onOpenLibrary({ kind: 'theme', city: f.city, query: f.name })}
                        className="w-full py-2 rounded-xl border border-amber-300/70 bg-amber-50 text-amber-800 text-[11px] font-black hover:bg-amber-100 active:scale-95 transition"
                      >
                        📚 Vedi gli itinerari pronti per questa fiera
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {fiere.length === 0 && (
            <p className="text-center text-xs font-bold text-gray-400 py-10">
              Nessuna fiera per questi filtri.
            </p>
          )}
        </div>
      )}

      {/* Filtri percorsi: continente, genere, senza auto */}
      {scheda === 'percorsi' && (
      <div className="flex items-center gap-2 px-4 py-3 shrink-0 overflow-x-auto no-scrollbar">
        <select
          value={continente}
          onChange={(e) => setContinente(e.target.value)}
          className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black bg-white text-gray-500 border border-red-200/60 outline-none"
          aria-label="Filtra per continente"
        >
          <option value="tutti">🌍 Ovunque</option>
          {continenti.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setSenzaAuto((v) => !v)}
          className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black transition-all border ${
            senzaAuto ? 'bg-[#7f1d1d] text-white border-[#7f1d1d]' : 'bg-white text-gray-500 border-red-200/60 hover:border-red-400'
          }`}
          title="Solo percorsi in treno, bici, a piedi o in navetta: si degusta senza guidare"
        >
          🚫🚗 Senza guidare
        </button>
        <button
          type="button"
          onClick={() => setGenere('tutti')}
          className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black transition-all border ${
            genere === 'tutti' ? 'bg-[#7f1d1d] text-white border-[#7f1d1d]' : 'bg-white text-gray-500 border-red-200/60 hover:border-red-400'
          }`}
        >
          Tutti i gusti
        </button>
        {generi.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setGenere(k)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black transition-all border ${
              genere === k ? 'bg-[#7f1d1d] text-white border-[#7f1d1d]' : 'bg-white text-gray-500 border-red-200/60 hover:border-red-400'
            }`}
          >
            {TASTE_KIND_LABELS[k].emoji} {TASTE_KIND_LABELS[k].label}
          </button>
        ))}
      </div>
      )}

      {/* Lista strade */}
      {scheda === 'percorsi' && (
      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-3">
        {lista.map((r) => {
          const espansa = expandedId === r.id;
          const giorni = new Set(r.stops.map((s) => s.day)).size;
          return (
            <div
              key={r.id}
              className={`bg-white border rounded-2xl shadow-sm transition-all ${
                espansa ? 'border-red-400/60 shadow-md' : 'border-red-100 hover:border-red-300'
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
                      <div className="text-xs font-black text-[#7f1d1d] leading-tight">{r.name}</div>
                      <div className="text-[10px] font-bold text-gray-500 mt-0.5">
                        {r.region}, {r.country} · {r.days} {r.days === 1 ? 'giorno' : 'giorni'} · {TRASPORTO_LABEL[r.transport]} · {r.stops.length} tappe
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-red-100 text-[#7f1d1d]">
                    {TASTE_KIND_LABELS[r.kind].emoji} {TASTE_KIND_LABELS[r.kind].label}
                  </span>
                </div>
              </button>

              {espansa && (
                <div className="px-3 pb-3 space-y-3">
                  <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    <p className="text-[11px] font-bold text-[#7f1d1d] leading-snug">{r.products}</p>
                  </div>

                  {/* Tabella tappe giorno per giorno */}
                  <div className="overflow-x-auto rounded-xl border border-red-100">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="bg-red-50 text-[#7f1d1d]">
                          <th className="text-left font-black px-2 py-1.5">G</th>
                          <th className="text-left font-black px-2 py-1.5">Tappa</th>
                          <th className="text-left font-black px-2 py-1.5">Cosa si trova</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.stops.map((s, i) => (
                          <tr key={`${s.place}-${i}`} className="border-t border-red-50">
                            <td className="px-2 py-1.5 font-black text-red-800 align-top">{s.day}</td>
                            <td className="px-2 py-1.5 font-bold text-gray-700 align-top whitespace-nowrap">{s.place}</td>
                            <td className="px-2 py-1.5 font-medium text-gray-500 align-top">{s.what}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    <span className="text-sm leading-none mt-0.5">🗓</span>
                    <p className="text-[11px] font-bold text-amber-900 leading-snug">{r.season}</p>
                  </div>

                  <p className="text-[11px] text-gray-600 leading-relaxed">{r.notes}</p>

                  {/* L'avvertenza che su una strada del vino non è un
                      dettaglio: si dice PRIMA di preparare il viaggio. */}
                  {(r.kind === 'vino' || r.kind === 'birra' || r.kind === 'distillati') && (
                    <div className={`rounded-xl px-3 py-2 border ${
                      r.transport === 'auto'
                        ? 'bg-red-50 border-red-300'
                        : 'bg-emerald-50 border-emerald-200'
                    }`}>
                      <p className={`text-[11px] font-black leading-snug ${
                        r.transport === 'auto' ? 'text-red-800' : 'text-emerald-800'
                      }`}>
                        {r.transport === 'auto'
                          ? '⚠️ Chi degusta non guida: metti in conto un autista, una navetta o un tour organizzato. In cantina la sputacchiera è normale, non è maleducazione.'
                          : `✅ Questo percorso si fa ${TRASPORTO_LABEL[r.transport].replace(/^\S+\s/, '')}: si degusta senza il problema di guidare.`}
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => onApply(buildTastePrefill(r) as RoutePrefill)}
                    className="w-full py-2.5 rounded-xl bg-[#7f1d1d] text-white text-xs font-black active:scale-95 transition-transform flex items-center justify-center gap-1.5"
                  >
                    <Wine className="w-3.5 h-3.5" /> Prepara il viaggio del gusto ✨
                  </button>

                  {onOpenLibrary && (
                    <button
                      type="button"
                      onClick={() => onOpenLibrary({ kind: 'theme', city: r.stops[0]?.place, query: r.name })}
                      className="w-full py-2 rounded-xl border border-amber-300/70 bg-amber-50 text-amber-800 text-[11px] font-black hover:bg-amber-100 active:scale-95 transition"
                    >
                      📚 Vedi gli itinerari pronti per questa strada
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {lista.length === 0 && (
          <p className="text-center text-xs font-bold text-gray-400 py-10">
            Nessuna strada per questi filtri: allarga la ricerca.
            <br />
            <span className="text-[10px] font-medium">
              Le cantine e i produttori singoli si cercano invece sulla mappa, con la chip 🍷 Vino e Gusto.
            </span>
          </p>
        )}
      </div>
      )}
    </div>
  );
}
