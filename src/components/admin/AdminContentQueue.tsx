import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getApiUrl } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import {
  ClipboardList, Route, Bug, Wrench, RefreshCw, Search, Lock, Unlock, Save,
  Trash2, AlertTriangle, CheckCircle2, XCircle, Play, Pencil, Info,
  Map as MapIcon, // MAI `import { Map }`: oscurerebbe la Map nativa e l'app crasha all'avvio
} from 'lucide-react';

/**
 * CODA CONTENUTI — la scrivania dell'admin per le cose che il server sa già
 * fare ma che nessuna interfaccia aveva mai mostrato.
 *
 * Quattro schede in una sola pagina:
 *   A. POI da rivedere      → GET  /api/admin/review-queue   (esisteva, mai chiamata)
 *                             POST /api/admin/lock-poi       (esisteva, mai chiamata)
 *                             POST /api/admin/poi/update     (esisteva, usata solo dall'editor mappa)
 *   B. Itinerari salvati    → GET  /api/admin/itineraries    (in arrivo)
 *                             POST /api/admin/itinerary/delete (in arrivo)
 *   C. Errori di sistema    → lettura diretta da Supabase (come AdminSystemErrors)
 *                             POST /api/admin/system-errors/resolve (in arrivo)
 *   D. Manutenzione         → lavori server senza UI: teaser, film-harvest,
 *                             semina libreria, arricchimento notturno.
 *
 * Le rotte "in arrivo" le sta scrivendo un altro agente: finché non esistono
 * la scheda mostra un avviso giallo, non un errore rosso.
 */

// ── Autenticazione admin: stesso helper di AdminDiagnostics ────────────────
const intestazioniAdmin = async (): Promise<Record<string, string>> => {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Esito a tre stati: serve a distinguere "rotta non ancora deployata" da
// "rotta rotta". Senza questa distinzione l'admin vedrebbe un rosso allarmante
// per una funzione semplicemente non ancora rilasciata.
type EsitoApi<T> =
  | { stato: 'ok'; dati: T }
  | { stato: 'assente' }
  | { stato: 'errore'; messaggio: string };

/**
 * Chiamata autenticata con riconoscimento delle rotte mancanti.
 *
 * ATTENZIONE: una rotta /api inesistente NON risponde sempre 404. In sviluppo
 * il middleware Vite, e in produzione locale il catch-all `app.get('*')`,
 * servono index.html con status 200. Quindi "assente" significa 404/501
 * oppure una risposta che è HTML invece che JSON.
 */
async function chiamaApi<T = any>(percorso: string, init?: RequestInit): Promise<EsitoApi<T>> {
  let res: Response;
  try {
    res = await fetch(getApiUrl(percorso), {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(await intestazioniAdmin()),
        ...((init?.headers as Record<string, string>) || {}),
      },
    });
  } catch (e: any) {
    return { stato: 'errore', messaggio: e?.message || 'Rete non raggiungibile' };
  }

  const testo = await res.text();
  let dati: any = null;
  try { dati = testo ? JSON.parse(testo) : null; } catch { dati = null; }

  if (res.status === 404 || res.status === 501 || (dati === null && testo.trim().startsWith('<'))) {
    return { stato: 'assente' };
  }
  if (!res.ok) {
    const dettaglio = dati?.error || dati?.message || `HTTP ${res.status}`;
    return { stato: 'errore', messaggio: res.status === 401 || res.status === 403 ? `${dettaglio} (sessione scaduta o utente non admin)` : String(dettaglio) };
  }
  return { stato: 'ok', dati: dati as T };
}

// ── Pezzi di UI condivisi ─────────────────────────────────────────────────

/** Avviso giallo per una rotta che il server non espone ancora. */
function AvvisoRottaAssente({ rotte, cosa }: { rotte: string[]; cosa: string }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
      <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm font-black text-amber-800">Rotta non ancora disponibile</p>
        <p className="text-xs text-amber-700 mt-1 leading-relaxed">
          {cosa} Il server non espone (ancora) {rotte.length > 1 ? 'le rotte' : 'la rotta'}{' '}
          {rotte.map((r, i) => (
            <React.Fragment key={r}>
              {i > 0 && ' e '}
              <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">{r}</code>
            </React.Fragment>
          ))}
          . Non è un guasto: la sezione tornerà viva da sola al prossimo deploy.
        </p>
      </div>
    </div>
  );
}

/** Errore rosso vero, con il bottone "riprova". */
function BloccoErrore({ messaggio, onRiprova }: { messaggio: string; onRiprova?: () => void }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-black text-red-700">Qualcosa è andato storto</p>
          <p className="text-xs text-red-600 mt-0.5 break-words">{messaggio}</p>
        </div>
      </div>
      {onRiprova && (
        <button onClick={onRiprova} className="shrink-0 px-3 py-2 rounded-xl bg-white border border-red-200 text-red-700 text-xs font-black hover:bg-red-100 transition-colors">
          Riprova
        </button>
      )}
    </div>
  );
}

/** Lista vuota con la spiegazione del perché (mai un vuoto muto). */
function ListaVuota({ titolo, spiegazione }: { titolo: string; spiegazione: string }) {
  return (
    <div className="p-10 text-center">
      <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
      <div className="text-sm font-black text-on-surface">{titolo}</div>
      <p className="text-xs text-on-surface-variant mt-1 max-w-md mx-auto leading-relaxed">{spiegazione}</p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// SEZIONE A — POI DA RIVEDERE
// ══════════════════════════════════════════════════════════════════════════

// La whitelist del server (server.ts, /api/admin/poi/update): qualunque altro
// campo viene scartato in silenzio, quindi il form mostra SOLO questi nove.
const CAMPI_MODIFICABILI = ['name', 'category', 'status', 'lat', 'lon', 'description_short', 'contact_phone', 'contact_website', 'is_gem'] as const;

// Categorie suggerite (l'elenco vero è molto più lungo: campo libero + datalist)
const CATEGORIE_SUGGERITE = ['monumenti', 'musei', 'chiese', 'natura', 'panorami', 'famiglie', 'gemme', 'beach', 'waterfall', 'cave', 'peak', 'volcano', 'lake', 'island', 'lighthouse', 'winery'];

// Stati ammessi da shared_pois. NB: 'approved' NON esiste, il vincolo lo rifiuta.
const STATI_POI = ['auto', 'verified', 'draft', 'needs_revision', 'rejected', 'hidden'];

function SezioneRevisione({
  selezionati,
  setSelezionati,
}: {
  selezionati: string[];
  setSelezionati: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const [pois, setPois] = useState<any[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [assente, setAssente] = useState(false);
  const [ricerca, setRicerca] = useState('');
  const [inModifica, setInModifica] = useState<string | null>(null);
  const [bozza, setBozza] = useState<Record<string, any>>({});
  const [operazione, setOperazione] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<{ tipo: 'ok' | 'errore'; testo: string } | null>(null);

  const carica = useCallback(async () => {
    setCaricamento(true);
    setErrore(null);
    setAssente(false);
    const esito = await chiamaApi<any[]>('/api/admin/review-queue');
    if (esito.stato === 'ok') setPois(Array.isArray(esito.dati) ? esito.dati : []);
    else if (esito.stato === 'assente') setAssente(true);
    else setErrore(esito.messaggio);
    setCaricamento(false);
  }, []);

  useEffect(() => { carica(); }, [carica]);

  const filtrati = useMemo(() => {
    const q = ricerca.trim().toLowerCase();
    if (!q) return pois;
    return pois.filter(p =>
      String(p.name || '').toLowerCase().includes(q) ||
      String(p.city || '').toLowerCase().includes(q) ||
      String(p.category || '').toLowerCase().includes(q) ||
      String(p.id || '').toLowerCase().includes(q)
    );
  }, [pois, ricerca]);

  const commuta = (id: string) =>
    setSelezionati(prec => prec.includes(id) ? prec.filter(x => x !== id) : [...prec, id]);

  const commutaTutti = () => {
    const idsPagina = filtrati.map(p => String(p.id));
    const tuttiPresi = idsPagina.length > 0 && idsPagina.every(id => selezionati.includes(id));
    setSelezionati(prec => tuttiPresi
      ? prec.filter(id => !idsPagina.includes(id))
      : [...new Set([...prec, ...idsPagina])]);
  };

  // Blocco/sblocco: un POI bloccato non viene più toccato dagli arricchimenti
  // automatici, quindi è un'azione con conseguenze → chiede conferma.
  const cambiaBlocco = async (poi: any) => {
    const nuovo = !poi.is_locked;
    const testo = nuovo
      ? `Bloccare "${poi.name}"? I lavori automatici (arricchimento, teaser, foto) smetteranno di modificarlo.`
      : `Sbloccare "${poi.name}"? Tornerà modificabile dai lavori automatici.`;
    if (!window.confirm(testo)) return;
    setOperazione(`lock:${poi.id}`);
    const esito = await chiamaApi('/api/admin/lock-poi', {
      method: 'POST',
      body: JSON.stringify({ poi_id: poi.id, is_locked: nuovo }),
    });
    if (esito.stato === 'ok') {
      setPois(prec => prec.map(p => p.id === poi.id ? { ...p, is_locked: nuovo } : p));
      setMessaggio({ tipo: 'ok', testo: `"${poi.name}" ora è ${nuovo ? 'bloccato' : 'sbloccato'}.` });
    } else {
      setMessaggio({ tipo: 'errore', testo: esito.stato === 'assente' ? 'Rotta /api/admin/lock-poi non trovata.' : esito.messaggio });
    }
    setOperazione(null);
  };

  const apriModifica = (poi: any) => {
    if (inModifica === poi.id) { setInModifica(null); return; }
    setInModifica(poi.id);
    // La bozza parte dai valori attuali: si inviano poi solo i campi cambiati.
    const iniziale: Record<string, any> = {};
    for (const c of CAMPI_MODIFICABILI) iniziale[c] = poi[c] ?? (c === 'is_gem' ? false : '');
    setBozza(iniziale);
  };

  const salva = async (poi: any) => {
    // Solo il diff: mandare tutto riscriverebbe campi che l'admin non ha toccato.
    const changes: Record<string, any> = {};
    for (const c of CAMPI_MODIFICABILI) {
      const attuale = poi[c] ?? (c === 'is_gem' ? false : '');
      if (String(bozza[c] ?? '') !== String(attuale ?? '')) changes[c] = bozza[c];
    }
    if (Object.keys(changes).length === 0) {
      setMessaggio({ tipo: 'errore', testo: 'Nessun campo modificato.' });
      return;
    }
    setOperazione(`save:${poi.id}`);
    const esito = await chiamaApi<{ poi: any }>('/api/admin/poi/update', {
      method: 'POST',
      // Contratto reale della rotta: { poiId, changes, reason } — NON { poi_id, updates }.
      body: JSON.stringify({ poiId: poi.id, changes, reason: 'coda revisione admin' }),
    });
    if (esito.stato === 'ok') {
      setPois(prec => prec.map(p => p.id === poi.id ? { ...p, ...changes } : p));
      setInModifica(null);
      setMessaggio({ tipo: 'ok', testo: `Salvato: ${Object.keys(changes).join(', ')}.` });
    } else {
      setMessaggio({ tipo: 'errore', testo: esito.stato === 'assente' ? 'Rotta /api/admin/poi/update non trovata.' : esito.messaggio });
    }
    setOperazione(null);
  };

  const campo = (poi: any, chiave: typeof CAMPI_MODIFICABILI[number], etichetta: string, tipo: 'text' | 'number' = 'text') => (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{etichetta}</span>
      <input
        type={tipo}
        value={bozza[chiave] ?? ''}
        onChange={e => setBozza(p => ({ ...p, [chiave]: tipo === 'number' ? e.target.value : e.target.value }))}
        list={chiave === 'category' ? 'wip-categorie-poi' : undefined}
        className="w-full mt-1 px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm outline-none focus:ring-2 focus:ring-primary/20"
      />
    </label>
  );

  if (assente) {
    return <AvvisoRottaAssente rotte={['/api/admin/review-queue']} cosa="La coda di revisione non si può leggere." />;
  }

  return (
    <div className="space-y-4">
      <datalist id="wip-categorie-poi">
        {CATEGORIE_SUGGERITE.map(c => <option key={c} value={c} />)}
      </datalist>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            value={ricerca}
            onChange={e => setRicerca(e.target.value)}
            placeholder="Cerca per nome, città, categoria, id..."
            className="w-full pl-8 pr-4 py-2 bg-surface border border-outline-variant rounded-xl text-xs font-medium text-on-surface outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button onClick={carica} disabled={caricamento} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-outline-variant text-xs font-black text-on-surface hover:bg-surface-variant/40 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${caricamento ? 'animate-spin' : ''}`} /> Aggiorna
        </button>
        <div className="text-xs text-on-surface-variant font-medium">
          {filtrati.length} POI segnalati · {selezionati.length} selezionati
        </div>
      </div>

      {messaggio && (
        <div className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 ${messaggio.tipo === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {messaggio.tipo === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {messaggio.testo}
        </div>
      )}

      {errore && <BloccoErrore messaggio={errore} onRiprova={carica} />}

      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[880px]">
            <thead>
              <tr className="bg-surface-variant/30 border-b border-outline-variant">
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={filtrati.length > 0 && filtrati.every(p => selezionati.includes(String(p.id)))}
                    onChange={commutaTutti}
                    title="Seleziona/deseleziona tutti i POI in elenco"
                  />
                </th>
                {['POI', 'Categoria', 'Città', 'Coordinate', 'Stato', 'Azioni'].map(h => (
                  <th key={h} className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-primary/60 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/40">
              {caricamento ? (
                <tr><td colSpan={7} className="p-8 text-center text-sm text-on-surface-variant">Caricamento della coda...</td></tr>
              ) : filtrati.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <ListaVuota
                      titolo={ricerca ? 'Nessun POI con questa ricerca' : 'Nessun POI in attesa di revisione'}
                      spiegazione={ricerca
                        ? 'Svuota il campo di ricerca per rivedere tutta la coda.'
                        : "In coda finiscono solo i POI con flag_review = true, alzata dai controlli qualità e dalle segnalazioni. Una coda vuota vuol dire che non c'è niente di sospetto da guardare."}
                    />
                  </td>
                </tr>
              ) : filtrati.map(poi => (
                <React.Fragment key={poi.id}>
                  <tr className="hover:bg-surface-variant/20 transition-colors">
                    <td className="px-3 py-3 align-top">
                      <input type="checkbox" checked={selezionati.includes(String(poi.id))} onChange={() => commuta(String(poi.id))} />
                    </td>
                    <td className="px-3 py-3 max-w-xs">
                      <div className="text-xs font-black text-on-surface break-words">{poi.name || '(senza nome)'}</div>
                      <div className="text-[10px] font-mono text-on-surface-variant break-all">{poi.id}</div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="px-2 py-1 bg-surface-variant/50 rounded-lg text-[11px] font-black text-on-surface">{poi.category || 'n/d'}</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-on-surface whitespace-nowrap">{poi.city || '—'}</td>
                    <td className="px-3 py-3 text-[10px] font-mono text-on-surface-variant whitespace-nowrap">
                      {poi.lat != null && poi.lon != null ? `${Number(poi.lat).toFixed(5)}, ${Number(poi.lon).toFixed(5)}` : '—'}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="px-2 py-1 rounded-full text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-200">{poi.status || 'n/d'}</span>
                      {poi.is_locked && (
                        <span className="ml-1 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-700 border border-amber-200">
                          <Lock className="w-3 h-3" /> bloccato
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => cambiaBlocco(poi)}
                          disabled={operazione === `lock:${poi.id}`}
                          className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-outline-variant text-[11px] font-black text-on-surface hover:bg-surface-variant/40 disabled:opacity-40 transition-colors"
                        >
                          {poi.is_locked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                          {poi.is_locked ? 'Sblocca' : 'Blocca'}
                        </button>
                        <button
                          onClick={() => apriModifica(poi)}
                          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[11px] font-black transition-colors ${inModifica === poi.id ? 'bg-primary text-white border-primary' : 'border-outline-variant text-on-surface hover:bg-surface-variant/40'}`}
                        >
                          <Pencil className="w-3.5 h-3.5" /> Modifica
                        </button>
                        {poi.lat != null && poi.lon != null && (
                          <a
                            href={`https://www.google.com/maps?q=${poi.lat},${poi.lon}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-outline-variant text-[11px] font-black text-on-surface hover:bg-surface-variant/40 transition-colors"
                          >
                            <MapIcon className="w-3.5 h-3.5" /> Apri in mappa
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>

                  {inModifica === poi.id && (
                    <tr className="bg-surface-variant/20">
                      <td colSpan={7} className="px-3 py-4">
                        <p className="text-[11px] text-on-surface-variant mb-3">
                          Il server accetta solo questi nove campi: qualunque altro verrebbe scartato in silenzio.
                          Si inviano soltanto quelli che cambi.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {campo(poi, 'name', 'Nome')}
                          {campo(poi, 'category', 'Categoria')}
                          <label className="block">
                            <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Stato</span>
                            <select
                              value={bozza.status ?? ''}
                              onChange={e => setBozza(p => ({ ...p, status: e.target.value }))}
                              className="w-full mt-1 px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm"
                            >
                              {/* 'approved' non è nella lista: il vincolo di shared_pois lo rifiuta */}
                              {STATI_POI.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </label>
                          {campo(poi, 'lat', 'Latitudine', 'number')}
                          {campo(poi, 'lon', 'Longitudine', 'number')}
                          {campo(poi, 'contact_phone', 'Telefono')}
                          {campo(poi, 'contact_website', 'Sito web')}
                          <label className="flex items-center gap-2 mt-5">
                            <input type="checkbox" checked={!!bozza.is_gem} onChange={e => setBozza(p => ({ ...p, is_gem: e.target.checked }))} />
                            <span className="text-xs font-black text-on-surface">È una gemma nascosta</span>
                          </label>
                        </div>
                        <label className="block mt-3">
                          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Descrizione breve</span>
                          <textarea
                            rows={3}
                            value={bozza.description_short ?? ''}
                            onChange={e => setBozza(p => ({ ...p, description_short: e.target.value }))}
                            className="w-full mt-1 px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </label>
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={() => salva(poi)}
                            disabled={operazione === `save:${poi.id}`}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-black disabled:opacity-50"
                          >
                            <Save className="w-4 h-4" /> {operazione === `save:${poi.id}` ? 'Salvataggio...' : 'Salva modifiche'}
                          </button>
                          <button onClick={() => setInModifica(null)} className="px-4 py-2 rounded-xl border border-outline-variant text-xs font-black text-on-surface hover:bg-surface-variant/40">
                            Annulla
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// SEZIONE B — ITINERARI SALVATI
// ══════════════════════════════════════════════════════════════════════════

const PAGINA_ITINERARI = 50;

function SezioneItinerari() {
  const [righe, setRighe] = useState<any[]>([]);
  const [totale, setTotale] = useState(0);
  const [offset, setOffset] = useState(0);
  const [ricerca, setRicerca] = useState('');
  const [ricercaDebounce, setRicercaDebounce] = useState('');
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [assente, setAssente] = useState(false);
  const [inCancellazione, setInCancellazione] = useState<string | null>(null);

  // Debounce sulla ricerca: ogni tasto premuto sarebbe una query sul DB.
  useEffect(() => {
    const t = setTimeout(() => { setRicercaDebounce(ricerca); setOffset(0); }, 400);
    return () => clearTimeout(t);
  }, [ricerca]);

  const carica = useCallback(async () => {
    setCaricamento(true);
    setErrore(null);
    setAssente(false);
    const p = new URLSearchParams();
    if (ricercaDebounce) p.set('q', ricercaDebounce);
    p.set('limit', String(PAGINA_ITINERARI));
    p.set('offset', String(offset));
    const esito = await chiamaApi<{ itineraries: any[]; total: number }>(`/api/admin/itineraries?${p.toString()}`);
    if (esito.stato === 'ok') {
      setRighe(esito.dati?.itineraries || []);
      setTotale(Number(esito.dati?.total) || 0);
    } else if (esito.stato === 'assente') {
      setAssente(true);
      setRighe([]);
    } else {
      setErrore(esito.messaggio);
    }
    setCaricamento(false);
  }, [ricercaDebounce, offset]);

  useEffect(() => { carica(); }, [carica]);

  const cancella = async (it: any) => {
    if (!window.confirm(`Cancellare definitivamente l'itinerario "${it.titolo || it.id}" di ${it.email || 'utente sconosciuto'}?\n\nL'utente lo perderà: l'operazione non si può annullare.`)) return;
    setInCancellazione(String(it.id));
    const esito = await chiamaApi('/api/admin/itinerary/delete', {
      method: 'POST',
      body: JSON.stringify({ id: it.id }),
    });
    if (esito.stato === 'ok') {
      setRighe(prec => prec.filter(r => r.id !== it.id));
      setTotale(t => Math.max(0, t - 1));
    } else if (esito.stato === 'assente') {
      setAssente(true);
    } else {
      setErrore(esito.messaggio);
    }
    setInCancellazione(null);
  };

  if (assente) {
    return (
      <div className="space-y-4">
        <AvvisoRottaAssente
          rotte={['/api/admin/itineraries', '/api/admin/itinerary/delete']}
          cosa="Gli itinerari salvati dagli utenti non si possono ancora elencare né cancellare da qui."
        />
        <button onClick={carica} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-outline-variant text-xs font-black text-on-surface hover:bg-surface-variant/40 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Ricontrolla
        </button>
      </div>
    );
  }

  const pagina = Math.floor(offset / PAGINA_ITINERARI) + 1;
  const pagine = Math.max(1, Math.ceil(totale / PAGINA_ITINERARI));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            value={ricerca}
            onChange={e => setRicerca(e.target.value)}
            placeholder="Cerca per titolo o email..."
            className="w-full pl-8 pr-4 py-2 bg-surface border border-outline-variant rounded-xl text-xs font-medium text-on-surface outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button onClick={carica} disabled={caricamento} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-outline-variant text-xs font-black text-on-surface hover:bg-surface-variant/40 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${caricamento ? 'animate-spin' : ''}`} /> Aggiorna
        </button>
        <div className="text-xs text-on-surface-variant font-medium">{totale.toLocaleString('it-IT')} itinerari</div>
      </div>

      {errore && <BloccoErrore messaggio={errore} onRiprova={carica} />}

      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[760px]">
            <thead>
              <tr className="bg-surface-variant/30 border-b border-outline-variant">
                {['Itinerario', 'Utente', 'Giorni', 'Tappe', 'Creato', 'Aggiornato', ''].map((h, i) => (
                  <th key={i} className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-primary/60 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/40">
              {caricamento ? (
                <tr><td colSpan={7} className="p-8 text-center text-sm text-on-surface-variant">Caricamento...</td></tr>
              ) : righe.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <ListaVuota
                      titolo={ricercaDebounce ? 'Nessun itinerario trovato' : 'Nessun itinerario salvato'}
                      spiegazione={ricercaDebounce
                        ? 'Prova con un altro titolo o con l\'email dell\'utente.'
                        : 'Qui compaiono gli itinerari che gli utenti hanno salvato dalla scheda Piano. Finché nessuno ne salva uno, la lista resta vuota.'}
                    />
                  </td>
                </tr>
              ) : righe.map(it => (
                <tr key={it.id} className="hover:bg-surface-variant/20 transition-colors">
                  <td className="px-3 py-3 max-w-xs">
                    <div className="text-xs font-black text-on-surface break-words">{it.titolo || '(senza titolo)'}</div>
                    <div className="text-[10px] font-mono text-on-surface-variant break-all">{it.id}</div>
                  </td>
                  <td className="px-3 py-3 max-w-[200px]">
                    <div className="text-xs text-on-surface truncate" title={it.email || ''}>{it.email || '—'}</div>
                    <div className="text-[10px] font-mono text-on-surface-variant truncate" title={it.user_id || ''}>{it.user_id || ''}</div>
                  </td>
                  <td className="px-3 py-3 text-xs font-black text-on-surface tabular-nums">{it.giorni ?? '—'}</td>
                  <td className="px-3 py-3 text-xs font-black text-on-surface tabular-nums">{it.tappe ?? '—'}</td>
                  <td className="px-3 py-3 text-[11px] text-on-surface-variant whitespace-nowrap">
                    {it.created_at ? new Date(it.created_at).toLocaleDateString('it-IT') : '—'}
                  </td>
                  <td className="px-3 py-3 text-[11px] text-on-surface-variant whitespace-nowrap">
                    {it.updated_at ? new Date(it.updated_at).toLocaleDateString('it-IT') : '—'}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <button
                      onClick={() => cancella(it)}
                      disabled={inCancellazione === String(it.id)}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-[11px] font-black hover:bg-red-100 disabled:opacity-40 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> {inCancellazione === String(it.id) ? '...' : 'Cancella'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totale > PAGINA_ITINERARI && (
          <div className="p-3 border-t border-outline-variant flex items-center justify-between">
            <span className="text-xs text-on-surface-variant font-medium">Pagina {pagina} di {pagine}</span>
            <div className="flex gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(o => Math.max(0, o - PAGINA_ITINERARI))}
                className="px-3 py-1.5 text-xs font-black text-primary border border-outline-variant rounded-lg hover:bg-surface-variant/40 disabled:opacity-40"
              >← Prec.</button>
              <button
                disabled={offset + PAGINA_ITINERARI >= totale}
                onClick={() => setOffset(o => o + PAGINA_ITINERARI)}
                className="px-3 py-1.5 text-xs font-black text-primary border border-outline-variant rounded-lg hover:bg-surface-variant/40 disabled:opacity-40"
              >Succ. →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// SEZIONE C — ERRORI DI SISTEMA (con chiusura in blocco)
// ══════════════════════════════════════════════════════════════════════════

const PAGINA_ERRORI = 50;

function SezioneErrori() {
  const [errori, setErrori] = useState<any[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [erroreLettura, setErroreLettura] = useState<string | null>(null);
  const [tabellaAssente, setTabellaAssente] = useState(false);
  const [rottaAssente, setRottaAssente] = useState(false);
  const [livello, setLivello] = useState('tutti');
  const [soloAperti, setSoloAperti] = useState(true);
  const [ricerca, setRicerca] = useState('');
  const [selezione, setSelezione] = useState<string[]>([]);
  const [pagina, setPagina] = useState(0);
  const [giorni, setGiorni] = useState(30);
  const [operazione, setOperazione] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<{ tipo: 'ok' | 'errore'; testo: string } | null>(null);

  // Lettura diretta da Supabase, come fa AdminSystemErrors: la tabella è
  // leggibile dal client e non ha senso aggiungere una rotta solo per questo.
  const carica = useCallback(async () => {
    setCaricamento(true);
    setErroreLettura(null);
    setTabellaAssente(false);
    try {
      let tutte: any[] = [];
      let da = 0;
      const passo = 1000;
      let ancora = true;
      while (ancora) {
        const { data, error } = await supabase
          .from('system_errors')
          .select('*')
          .order('created_at', { ascending: false })
          .range(da, da + passo - 1);
        if (error) {
          // 42P01 = tabella inesistente, PGRST205 = non in schema cache:
          // in entrambi i casi la migration di osservabilità non è applicata.
          if (error.code === '42P01' || error.code === 'PGRST205') setTabellaAssente(true);
          else setErroreLettura(error.message);
          ancora = false;
        } else if (data && data.length > 0) {
          tutte = [...tutte, ...data];
          da += passo;
          if (data.length < passo) ancora = false;
        } else {
          ancora = false;
        }
      }
      setErrori(tutte);
    } catch (e: any) {
      setErroreLettura(e?.message || 'Lettura fallita');
    }
    setCaricamento(false);
    setPagina(0);
    setSelezione([]);
  }, []);

  useEffect(() => { carica(); }, [carica]);

  // I livelli non sono una lista fissa nel DB: si ricavano dai dati veri,
  // così il filtro non nasconde mai un livello che qualcuno ha inventato.
  const livelli = useMemo(() => {
    const s = new Set<string>();
    for (const e of errori) if (e.level) s.add(String(e.level));
    return [...s].sort();
  }, [errori]);

  const filtrati = useMemo(() => {
    const q = ricerca.trim().toLowerCase();
    return errori.filter(e => {
      if (livello !== 'tutti' && String(e.level || '') !== livello) return false;
      if (soloAperti && e.resolved === true) return false;
      if (!q) return true;
      const testo = `${e.source || ''} ${e.message || e.error_message || ''}`.toLowerCase();
      return testo.includes(q);
    });
  }, [errori, livello, soloAperti, ricerca]);

  const pagati = filtrati.slice(pagina * PAGINA_ERRORI, (pagina + 1) * PAGINA_ERRORI);
  const pagine = Math.max(1, Math.ceil(filtrati.length / PAGINA_ERRORI));
  const apertiTotali = errori.filter(e => e.resolved !== true).length;

  const commuta = (id: string) =>
    setSelezione(prec => prec.includes(id) ? prec.filter(x => x !== id) : [...prec, id]);

  const commutaPagina = () => {
    const ids = pagati.map(e => String(e.id));
    const tuttiPresi = ids.length > 0 && ids.every(id => selezione.includes(id));
    setSelezione(prec => tuttiPresi ? prec.filter(id => !ids.includes(id)) : [...new Set([...prec, ...ids])]);
  };

  const risolvi = async (corpo: { ids: string[] } | { before: string }, descrizione: string) => {
    setOperazione(descrizione);
    setMessaggio(null);
    const esito = await chiamaApi<{ resolved?: number }>('/api/admin/system-errors/resolve', {
      method: 'POST',
      body: JSON.stringify(corpo),
    });
    if (esito.stato === 'ok') {
      setMessaggio({ tipo: 'ok', testo: `Chiusi ${esito.dati?.resolved ?? 'gli errori'} selezionati.` });
      setSelezione([]);
      carica();
    } else if (esito.stato === 'assente') {
      setRottaAssente(true);
    } else {
      setMessaggio({ tipo: 'errore', testo: esito.messaggio });
    }
    setOperazione(null);
  };

  const risolviSelezionati = () => {
    if (selezione.length === 0) return;
    if (!window.confirm(`Segnare come risolti ${selezione.length} errori? Spariranno dal filtro "solo non risolti".`)) return;
    risolvi({ ids: selezione }, 'selezionati');
  };

  const risolviVecchi = () => {
    const soglia = new Date(Date.now() - giorni * 86400000);
    const quanti = errori.filter(e => e.resolved !== true && new Date(e.created_at) < soglia).length;
    if (!window.confirm(`Segnare come risolti tutti gli errori aperti più vecchi di ${giorni} giorni (${quanti} righe, prima del ${soglia.toLocaleDateString('it-IT')})?`)) return;
    risolvi({ before: soglia.toISOString() }, 'vecchi');
  };

  if (tabellaAssente) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-black text-amber-800">Tabella <code className="font-mono">system_errors</code> assente</p>
          <p className="text-xs text-amber-700 mt-1">
            La migration <code className="font-mono">20260807120000_admin_observability.sql</code> non è stata applicata al database in uso.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rottaAssente && (
        <AvvisoRottaAssente
          rotte={['/api/admin/system-errors/resolve']}
          cosa="Gli errori si leggono ma non si possono ancora chiudere."
        />
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-surface border border-outline-variant rounded-2xl p-3 text-center">
          <div className="text-2xl font-black text-on-surface tabular-nums">{errori.length.toLocaleString('it-IT')}</div>
          <div className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mt-1">Totali</div>
        </div>
        <div className="bg-red-50 border border-red-200/60 rounded-2xl p-3 text-center">
          <div className="text-2xl font-black text-red-700 tabular-nums">{apertiTotali.toLocaleString('it-IT')}</div>
          <div className="text-[10px] font-black uppercase tracking-widest text-red-500 mt-1">Ancora aperti</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200/60 rounded-2xl p-3 text-center">
          <div className="text-2xl font-black text-emerald-700 tabular-nums">{(errori.length - apertiTotali).toLocaleString('it-IT')}</div>
          <div className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mt-1">Risolti</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={livello}
          onChange={e => { setLivello(e.target.value); setPagina(0); }}
          className="px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-xs font-bold"
        >
          <option value="tutti">Tutti i livelli</option>
          {livelli.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-outline-variant bg-surface text-xs font-bold text-on-surface cursor-pointer">
          <input type="checkbox" checked={soloAperti} onChange={e => { setSoloAperti(e.target.checked); setPagina(0); }} />
          Solo non risolti
        </label>
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            value={ricerca}
            onChange={e => { setRicerca(e.target.value); setPagina(0); }}
            placeholder="Cerca in sorgente e messaggio..."
            className="w-full pl-8 pr-4 py-2 bg-surface border border-outline-variant rounded-xl text-xs font-medium text-on-surface outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button onClick={carica} disabled={caricamento} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-outline-variant text-xs font-black text-on-surface hover:bg-surface-variant/40 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${caricamento ? 'animate-spin' : ''}`} /> Aggiorna
        </button>
        <span className="text-xs text-on-surface-variant font-medium">{filtrati.length.toLocaleString('it-IT')} in elenco</span>
      </div>

      {/* Chiusura in blocco */}
      <div className="bg-surface border border-outline-variant rounded-2xl p-3 flex flex-wrap items-center gap-2">
        <button
          onClick={risolviSelezionati}
          disabled={selezione.length === 0 || operazione !== null}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-black hover:bg-emerald-100 disabled:opacity-40 transition-colors"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          {operazione === 'selezionati' ? 'Chiusura...' : `Segna risolti i selezionati (${selezione.length})`}
        </button>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-on-surface-variant">oppure tutti quelli più vecchi di</span>
          <input
            type="number"
            min={1}
            max={365}
            value={giorni}
            onChange={e => setGiorni(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
            className="w-16 px-2 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-xs font-bold text-center"
          />
          <span className="text-xs font-bold text-on-surface-variant">giorni</span>
          <button
            onClick={risolviVecchi}
            disabled={operazione !== null}
            className="px-3 py-2 rounded-xl border border-outline-variant text-xs font-black text-on-surface hover:bg-surface-variant/40 disabled:opacity-40 transition-colors"
          >
            {operazione === 'vecchi' ? 'Chiusura...' : 'Chiudi in blocco'}
          </button>
        </div>
      </div>

      {messaggio && (
        <div className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 ${messaggio.tipo === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {messaggio.tipo === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {messaggio.testo}
        </div>
      )}

      {erroreLettura && <BloccoErrore messaggio={erroreLettura} onRiprova={carica} />}

      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[720px]">
            <thead>
              <tr className="bg-surface-variant/30 border-b border-outline-variant">
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={pagati.length > 0 && pagati.every(e => selezione.includes(String(e.id)))}
                    onChange={commutaPagina}
                    title="Seleziona/deseleziona la pagina"
                  />
                </th>
                {['Livello', 'Quando', 'Sorgente', 'Messaggio', 'Stato'].map(h => (
                  <th key={h} className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-primary/60 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/40">
              {caricamento ? (
                <tr><td colSpan={6} className="p-8 text-center text-sm text-on-surface-variant">Caricamento...</td></tr>
              ) : pagati.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <ListaVuota
                      titolo="Nessun errore con questi filtri"
                      spiegazione={soloAperti
                        ? 'Stai guardando solo i non risolti: togli la spunta per rivedere anche quelli già chiusi.'
                        : 'Nessuna riga corrisponde a livello e ricerca scelti.'}
                    />
                  </td>
                </tr>
              ) : pagati.map(e => {
                const quando = new Date(e.created_at);
                const messaggioRiga = e.message || e.error_message || '(senza messaggio)';
                const risolto = e.resolved === true;
                return (
                  <tr key={e.id} className={`hover:bg-surface-variant/20 transition-colors ${risolto ? 'opacity-60' : ''}`}>
                    <td className="px-3 py-3 align-top">
                      <input type="checkbox" checked={selezione.includes(String(e.id))} onChange={() => commuta(String(e.id))} />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-black border ${
                        e.level === 'critical' || e.level === 'error' ? 'bg-red-100 text-red-700 border-red-200'
                          : e.level === 'warning' ? 'bg-amber-100 text-amber-700 border-amber-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {e.level || 'n/d'}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="text-xs font-bold text-on-surface">{quando.toLocaleDateString('it-IT')}</div>
                      <div className="text-[10px] font-mono text-on-surface-variant">{quando.toLocaleTimeString('it-IT')}</div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="px-2 py-1 bg-surface-variant/50 rounded-lg text-[11px] font-black text-on-surface">{e.source || 'n/d'}</span>
                    </td>
                    <td className="px-3 py-3 max-w-md">
                      <div className="text-xs text-on-surface break-words">{messaggioRiga}</div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {risolto
                        ? <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /> risolto</span>
                        : <span className="inline-flex items-center gap-1 text-[11px] font-black text-red-500"><AlertTriangle className="w-3.5 h-3.5" /> aperto</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {pagine > 1 && (
          <div className="p-3 border-t border-outline-variant flex items-center justify-between">
            <span className="text-xs text-on-surface-variant font-medium">Pagina {pagina + 1} di {pagine}</span>
            <div className="flex gap-2">
              <button disabled={pagina === 0} onClick={() => setPagina(p => p - 1)} className="px-3 py-1.5 text-xs font-black text-primary border border-outline-variant rounded-lg hover:bg-surface-variant/40 disabled:opacity-40">← Prec.</button>
              <button disabled={pagina >= pagine - 1} onClick={() => setPagina(p => p + 1)} className="px-3 py-1.5 text-xs font-black text-primary border border-outline-variant rounded-lg hover:bg-surface-variant/40 disabled:opacity-40">Succ. →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// SEZIONE D — MANUTENZIONE CONTENUTI
// ══════════════════════════════════════════════════════════════════════════

const LINGUE_TEASER = [
  { id: 'it', nome: 'Italiano' }, { id: 'en', nome: 'Inglese' }, { id: 'fr', nome: 'Francese' },
  { id: 'es', nome: 'Spagnolo' }, { id: 'de', nome: 'Tedesco' }, { id: 'ru', nome: 'Russo' },
  { id: 'zh', nome: 'Cinese' },
];

/** Riquadro di un singolo lavoro: descrizione onesta, conferma, esito JSON. */
function SchedaLavoro({
  titolo,
  descrizione,
  durata,
  costo,
  esito,
  inCorso,
  disabilitato,
  motivoDisabilitato,
  onLancia,
  children,
}: {
  titolo: string;
  descrizione: string;
  durata: string;
  costo: string;
  esito: { stato: 'ok' | 'errore' | 'assente'; testo: string } | null;
  inCorso: boolean;
  disabilitato?: boolean;
  motivoDisabilitato?: string;
  onLancia: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-outline-variant rounded-2xl p-4 space-y-3">
      <div>
        <h3 className="text-sm font-black text-on-surface">{titolo}</h3>
        <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">{descrizione}</p>
      </div>

      <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
        <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">⏱ {durata}</span>
        <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">💸 {costo}</span>
      </div>

      {children}

      <button
        onClick={onLancia}
        disabled={inCorso || disabilitato}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-black disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        title={disabilitato ? motivoDisabilitato : undefined}
      >
        {inCorso ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        {inCorso ? 'In corso, non chiudere la pagina...' : 'Lancia'}
      </button>

      {disabilitato && motivoDisabilitato && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{motivoDisabilitato}</p>
      )}

      {esito && (
        <div className={`rounded-xl border p-3 ${
          esito.stato === 'ok' ? 'bg-emerald-50 border-emerald-200'
            : esito.stato === 'assente' ? 'bg-amber-50 border-amber-200'
              : 'bg-red-50 border-red-200'}`}>
          <div className={`text-[10px] font-black uppercase tracking-widest mb-1.5 ${
            esito.stato === 'ok' ? 'text-emerald-700' : esito.stato === 'assente' ? 'text-amber-700' : 'text-red-700'}`}>
            {esito.stato === 'ok' ? 'Esito' : esito.stato === 'assente' ? 'Rotta non disponibile' : 'Errore'}
          </div>
          <pre className="text-[11px] font-mono text-on-surface whitespace-pre-wrap break-words max-h-56 overflow-y-auto">{esito.testo}</pre>
        </div>
      )}
    </div>
  );
}

function SezioneManutenzione({ selezionati }: { selezionati: string[] }) {
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [esiti, setEsiti] = useState<Record<string, { stato: 'ok' | 'errore' | 'assente'; testo: string }>>({});
  const [idsTeaser, setIdsTeaser] = useState('');
  const [linguaTeaser, setLinguaTeaser] = useState('it');
  const [limiteSemina, setLimiteSemina] = useState(5);

  const idsPuliti = useMemo(
    () => idsTeaser.split(',').map(s => s.trim()).filter(Boolean),
    [idsTeaser]
  );

  const lancia = async (
    chiave: string,
    percorso: string,
    init: RequestInit,
    conferma: string
  ) => {
    if (!window.confirm(conferma)) return;
    setInCorso(chiave);
    setEsiti(p => ({ ...p, [chiave]: { stato: 'ok', testo: 'Richiesta inviata, attendo la risposta del server...' } }));
    const esito = await chiamaApi<any>(percorso, init);
    setEsiti(p => ({
      ...p,
      [chiave]: esito.stato === 'ok'
        ? { stato: 'ok', testo: JSON.stringify(esito.dati, null, 2) }
        : esito.stato === 'assente'
          ? { stato: 'assente', testo: `Il server non espone ${percorso}. Probabilmente questo build è più vecchio della rotta.` }
          : { stato: 'errore', testo: esito.messaggio },
    }));
    setInCorso(null);
  };

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 leading-relaxed">
          Questi lavori chiamano modelli AI e servizi esterni: <strong>costano soldi veri</strong> e possono
          durare minuti. Ognuno chiede conferma prima di partire. Su Vercel il limite è 300 secondi:
          oltre quel tempo la richiesta viene troncata anche se il lavoro sul server è andato a buon fine.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SchedaLavoro
          titolo="Genera teaser multilingua"
          descrizione="Per ogni POI indicato scrive la frase-esca che la voce pronuncia all'ingresso nel geofence, nella lingua scelta. Salta i POI che quel teaser ce l'hanno già, quindi rilanciarlo non raddoppia la spesa. Massimo 200 id per chiamata."
          durata="qualche secondo per POI"
          costo="1 chiamata AI per POI mancante"
          esito={esiti.teaser || null}
          inCorso={inCorso === 'teaser'}
          disabilitato={idsPuliti.length === 0}
          motivoDisabilitato="Senza id non fa nulla: seleziona dei POI nella scheda «POI da rivedere» oppure incolla qui gli id separati da virgola."
          onLancia={() => lancia(
            'teaser',
            '/api/poi/batch-teaser',
            { method: 'POST', body: JSON.stringify({ poiIds: idsPuliti.slice(0, 200), lang: linguaTeaser }) },
            `Generare i teaser in ${LINGUE_TEASER.find(l => l.id === linguaTeaser)?.nome} per ${Math.min(idsPuliti.length, 200)} POI? Ogni POI senza teaser costa una chiamata AI.`
          )}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <select
                value={linguaTeaser}
                onChange={e => setLinguaTeaser(e.target.value)}
                className="px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-xs font-bold"
              >
                {LINGUE_TEASER.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
              <button
                onClick={() => setIdsTeaser(selezionati.join(', '))}
                disabled={selezionati.length === 0}
                className="px-3 py-2 rounded-xl border border-outline-variant text-xs font-black text-on-surface hover:bg-surface-variant/40 disabled:opacity-40 transition-colors"
              >
                Usa i {selezionati.length} selezionati
              </button>
            </div>
            <textarea
              rows={3}
              value={idsTeaser}
              onChange={e => setIdsTeaser(e.target.value)}
              placeholder="id-poi-1, id-poi-2, id-poi-3..."
              className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-[11px] font-mono outline-none focus:ring-2 focus:ring-primary/20"
            />
            <p className="text-[11px] text-on-surface-variant">
              {idsPuliti.length === 0
                ? 'Nessun id: il lavoro non partirebbe comunque.'
                : `${idsPuliti.length} id pronti${idsPuliti.length > 200 ? ' (ne verranno usati i primi 200)' : ''}.`}
            </p>
          </div>
        </SchedaLavoro>

        <SchedaLavoro
          titolo="Harvest film/libri per la Libreria"
          descrizione="Interroga Wikidata per opere famose girate o ambientate in più luoghi, le raggruppa per zona e ne salva i descrittori negli shard della Libreria. Non genera testi: raccoglie solo materia prima. Si rilancia più volte, ogni volta avanza di una pagina."
          durata="1-3 minuti a chiamata"
          costo="nessuna AI: solo query SPARQL a Wikidata"
          esito={esiti.harvest || null}
          inCorso={inCorso === 'harvest'}
          onLancia={() => lancia(
            'harvest',
            '/api/library/film-harvest',
            { method: 'POST', body: JSON.stringify({}) },
            'Lanciare la raccolta film/libri da Wikidata? Dura qualche minuto e riprende dall\'ultima pagina salvata.'
          )}
        />

        <SchedaLavoro
          titolo="Semina Libreria"
          descrizione="Prende i descrittori prioritari non ancora seminati e genera per ognuno l'itinerario completo, con doppia verifica anti-invenzione. È il lavoro più lento e più caro della lista: ogni voce costa fra 30 e 90 secondi. Su Vercel non superare 2-3."
          durata="30-90 secondi per voce"
          costo="più chiamate AI per voce (generazione + verifica)"
          esito={esiti.semina || null}
          inCorso={inCorso === 'semina'}
          onLancia={() => lancia(
            'semina',
            '/api/library/seed',
            { method: 'POST', body: JSON.stringify({ limit: limiteSemina }) },
            `Seminare ${limiteSemina} voci della Libreria? Sono ${limiteSemina} itinerari generati e verificati dall'AI: la spesa è reale e possono volerci diversi minuti.`
          )}
        >
          <label className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Quante voci</span>
            <input
              type="number"
              min={1}
              max={10}
              value={limiteSemina}
              onChange={e => setLimiteSemina(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              className="w-16 px-2 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-xs font-bold text-center"
            />
            <span className="text-[11px] text-on-surface-variant">massimo 10 · consigliato 2-3</span>
          </label>
        </SchedaLavoro>

        <SchedaLavoro
          titolo="Arricchisci POI (lotto notturno)"
          descrizione="È lo stesso lavoro che il cron Vercel esegue alle 03:00: prende fino a 50 POI culturali o naturali senza descrizione (solo con stato auto o verified, mai le bozze) e ci scrive testo e dati. Lanciarlo a mano serve quando il cron è saltato o si vuole vedere subito il risultato."
          durata="1-4 minuti per lotto da 50"
          costo="fino a 50 chiamate AI + Wikipedia/Commons"
          esito={esiti.enrich || null}
          inCorso={inCorso === 'enrich'}
          onLancia={() => lancia(
            'enrich',
            '/api/poi/batch-enrich',
            { method: 'GET' },
            'Forzare ora l\'arricchimento di un lotto fino a 50 POI? Consuma chiamate AI a pagamento.'
          )}
        />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// GUSCIO — le quattro schede
// ══════════════════════════════════════════════════════════════════════════

type Scheda = 'revisione' | 'itinerari' | 'errori' | 'manutenzione';

const SCHEDE: Array<{ id: Scheda; testo: string; icona: React.ReactNode }> = [
  { id: 'revisione', testo: 'POI da rivedere', icona: <ClipboardList className="w-3.5 h-3.5" /> },
  { id: 'itinerari', testo: 'Itinerari salvati', icona: <Route className="w-3.5 h-3.5" /> },
  { id: 'errori', testo: 'Errori di sistema', icona: <Bug className="w-3.5 h-3.5" /> },
  { id: 'manutenzione', testo: 'Manutenzione', icona: <Wrench className="w-3.5 h-3.5" /> },
];

export default function AdminContentQueue() {
  const [scheda, setScheda] = useState<Scheda>('revisione');
  // La selezione dei POI vive qui e non dentro la scheda A: serve anche alla
  // manutenzione (teaser in blocco) e deve sopravvivere al cambio di scheda.
  const [poiSelezionati, setPoiSelezionati] = useState<string[]>([]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary" />
          Coda contenuti
        </h2>
        <p className="text-sm text-on-surface-variant mt-1">
          POI segnalati, itinerari degli utenti, errori da chiudere e i lavori di manutenzione del server.
        </p>
      </div>

      {/* Pillole di navigazione: scorrono in orizzontale su schermo stretto */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex bg-surface-variant/40 rounded-xl p-1 gap-1 w-max">
          {SCHEDE.map(s => (
            <button
              key={s.id}
              onClick={() => setScheda(s.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap transition-all ${
                scheda === s.id ? 'bg-surface text-primary shadow-sm' : 'text-on-surface-variant hover:text-primary'
              }`}
            >
              {s.icona} {s.testo}
              {s.id === 'revisione' && poiSelezionati.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-white text-[9px]">{poiSelezionati.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {scheda === 'revisione' && <SezioneRevisione selezionati={poiSelezionati} setSelezionati={setPoiSelezionati} />}
      {scheda === 'itinerari' && <SezioneItinerari />}
      {scheda === 'errori' && <SezioneErrori />}
      {scheda === 'manutenzione' && <SezioneManutenzione selezionati={poiSelezionati} />}
    </div>
  );
}
