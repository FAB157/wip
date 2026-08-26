import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  Flag, CheckCircle2, Search, Clock, Check, XCircle,
  RefreshCw, Eye, EyeOff, MapPin, Download, Bell,
  ChevronLeft, ChevronRight, ExternalLink, Copy, RotateCcw, X, Info
} from 'lucide-react';

export interface PoiReport {
  id: string;
  poi_id: string;
  poi_name: string;
  user_id: string | null;
  error_type: string;
  details: string | null;
  status: 'pending' | 'resolved' | 'rejected';
  created_at: string;
  user_email?: string;
}

const ERROR_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  wrong_info: { label: 'Informazioni errate', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  wrong_location: { label: 'Posizione sbagliata', color: 'bg-red-100 text-red-700 border-red-200' },
  closed_place: { label: 'Luogo chiuso', color: 'bg-gray-100 text-gray-700 border-gray-200' },
  inappropriate: { label: 'Contenuto inappropriato', color: 'bg-rose-100 text-rose-700 border-rose-200' },
  duplicate: { label: 'Duplicato', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  missing_info: { label: 'Info mancanti', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  other: { label: 'Altro', color: 'bg-slate-100 text-slate-700 border-slate-200' },
};

function getErrorTypeInfo(type: string) {
  return ERROR_TYPE_LABELS[type] || { label: type || 'Sconosciuto', color: 'bg-slate-100 text-slate-700 border-slate-200' };
}

// Paginazione server-side: con un semplice select('*') PostgREST tronca in
// silenzio a 1000 righe e le segnalazioni più vecchie sparivano dal pannello
// senza che nessuno se ne accorgesse.
const PAGE_SIZE = 50;

// Il testo cercato finisce dentro un .or() di PostgREST, dove virgole,
// parentesi e asterischi sono SINTASSI: se restano nel termine la query fallisce.
function sanitizeTerm(raw: string) {
  return raw.replace(/[,()*']/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Coordinate e visibilità del POI segnalato: non stanno in poi_reports. */
interface PoiInfo {
  lat: number | null;
  lon: number | null;
  is_hidden: boolean;
}

export default function AdminReports() {
  const [reports, setReports] = useState<PoiReport[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<'pending' | 'resolved' | 'rejected' | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedReport, setSelectedReport] = useState<PoiReport | null>(null);
  const [page, setPage] = useState(0);
  // Conteggi presi dal server: con la paginazione non si possono più contare le
  // righe caricate, sarebbero solo quelle della pagina corrente.
  const [counts, setCounts] = useState({ pending: 0, resolved: 0, rejected: 0 });
  // poi_reports NON ha lat/lon: le leggiamo da shared_pois con UNA sola query
  // .in(...) sugli id della pagina, mai una query per riga.
  const [poiInfo, setPoiInfo] = useState<Record<string, PoiInfo>>({});
  // Conferma inline a due click (niente window.confirm, che blocca il thread e
  // non si può stilare): la chiave è "azione:idSegnalazione".
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const totalCount = counts.pending + counts.resolved + counts.rejected;
  const filteredCount = filter === 'all' ? totalCount : counts[filter];
  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));

  // Debounce: ora la ricerca è server-side, senza attesa partirebbe una query
  // per ogni tasto premuto.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    fetchReports();
  }, [filter, debouncedSearch, page]);

  const changeFilter = (next: 'pending' | 'resolved' | 'rejected' | 'all') => {
    setFilter(next);
    // Cambiando filtro il numero di pagine cambia: restare a pagina 7 mostrerebbe
    // una tabella vuota.
    setPage(0);
  };

  // Traduce il testo cercato nei filtri PostgREST. L'email di chi segnala non
  // sta in poi_reports (viene da user_profiles), quindi la convertiamo prima in
  // una lista di user_id, altrimenti la ricerca per email smetterebbe di funzionare.
  const buildSearchFilter = async (): Promise<(q: any) => any> => {
    const term = sanitizeTerm(debouncedSearch);
    if (term.length === 0) return (q: any) => q;

    let matchedUserIds: string[] = [];
    const { data: byEmail } = await supabase
      .from('user_profiles')
      .select('id')
      .ilike('email', `%${term}%`)
      .limit(20);
    matchedUserIds = (byEmail || []).map((p: any) => p.id).filter(Boolean);

    const ors = [
      `poi_name.ilike.%${term}%`,
      `details.ilike.%${term}%`,
      `error_type.ilike.%${term}%`,
      `poi_id.ilike.%${term}%`
    ];
    if (matchedUserIds.length > 0) ors.push(`user_id.in.(${matchedUserIds.join(',')})`);
    return (q: any) => q.or(ors.join(','));
  };

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      const applySearch = await buildSearchFilter();

      // head:true non trasferisce nessuna riga, solo il Content-Range col totale.
      // 'exact' è sostenibile QUI perché poi_reports è una tabella piccola:
      // non va mai fatto su shared_pois, che ha milioni di righe.
      const statuses = ['pending', 'resolved', 'rejected'] as const;
      const countResults = await Promise.all(statuses.map(s =>
        applySearch(
          supabase.from('poi_reports').select('id', { count: 'exact', head: true }).eq('status', s)
        )
      ));
      setCounts({
        pending: countResults[0]?.count || 0,
        resolved: countResults[1]?.count || 0,
        rejected: countResults[2]?.count || 0
      });

      // I filtri vanno applicati PRIMA di order/range: dopo, supabase-js
      // restituisce un transform builder che non espone più .eq()/.or().
      let query: any = supabase.from('poi_reports').select('*');
      if (filter !== 'all') query = query.eq('status', filter);
      query = applySearch(query);

      const from = page * PAGE_SIZE;
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;

      const rawReports = data || [];

      // Fetch user emails
      const userIds = [...new Set(rawReports.map((r: any) => r.user_id).filter(Boolean))];
      let emailMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, email')
          .in('id', userIds);
        (profiles || []).forEach((p: any) => { emailMap[p.id] = p.email || p.id; });
      }

      const enriched: PoiReport[] = rawReports.map((r: any) => ({
        ...r,
        user_email: r.user_id ? (emailMap[r.user_id] || r.user_id) : 'Anonimo',
      }));

      setReports(enriched);

      // Coordinate + is_hidden dei POI di QUESTA pagina, in una query sola.
      const poiIds = [...new Set(enriched.map(r => r.poi_id).filter(Boolean))];
      if (poiIds.length > 0) {
        const { data: poiRows } = await supabase
          .from('shared_pois')
          .select('id, lat, lon, is_hidden')
          .in('id', poiIds);
        const map: Record<string, PoiInfo> = {};
        (poiRows || []).forEach((p: any) => {
          map[p.id] = {
            lat: typeof p.lat === 'number' ? p.lat : null,
            lon: typeof p.lon === 'number' ? p.lon : null,
            is_hidden: !!p.is_hidden
          };
        });
        setPoiInfo(map);
      } else {
        setPoiInfo({});
      }
    } catch (e) {
      console.error('Error fetching reports:', e);
      setFeedback({ type: 'error', text: 'Errore nel caricamento delle segnalazioni dal database.' });
    } finally {
      setIsLoading(false);
    }
  };

  // Primo click: arma la conferma. Secondo click sulla STESSA riga: esegue.
  const guarded = (key: string, run: () => void) => {
    if (confirmKey !== key) {
      setConfirmKey(key);
      return;
    }
    setConfirmKey(null);
    run();
  };
  const isArmed = (key: string) => confirmKey === key;

  // 'pending' è ammesso perché una segnalazione chiusa per sbaglio deve poter
  // tornare in coda: senza questo non esisteva nessun modo di riaprirla.
  const resolveReport = async (id: string, status: 'pending' | 'resolved' | 'rejected') => {
    try {
      const previous = reports.find(r => r.id === id)?.status;
      const { error } = await supabase
        .from('poi_reports')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
      setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
      if (selectedReport?.id === id) setSelectedReport(prev => prev ? { ...prev, status } : null);
      // Sposto il conteggio a mano invece di rifare la query: la riga resta dov'è
      // (così si può riaprirla subito) ma le card KPI restano coerenti.
      if (previous && previous !== status) {
        setCounts(prev => {
          const next = { ...prev };
          next[previous] = Math.max(0, next[previous] - 1);
          next[status] = next[status] + 1;
          return next;
        });
      }
      // Aggiorna il badge "Segnalazioni" sul tab del pannello admin
      window.dispatchEvent(new CustomEvent('wip-reports-updated'));
    } catch (e) {
      console.error('Error resolving report:', e);
      setFeedback({ type: 'error', text: 'Errore nell\'aggiornamento dello stato della segnalazione.' });
    }
  };

  // Nascondere/mostrare un POI tocca la mappa di TUTTI gli utenti: le due azioni
  // sono speculari, così un "Nascondi" sbagliato non è più definitivo.
  const setPoiHidden = async (report: PoiReport, hidden: boolean) => {
    try {
      const { error: poiErr } = await supabase
        .from('shared_pois')
        .update({ is_hidden: hidden })
        .eq('id', report.poi_id);
      if (poiErr) throw poiErr;

      setPoiInfo(prev => ({
        ...prev,
        [report.poi_id]: { lat: prev[report.poi_id]?.lat ?? null, lon: prev[report.poi_id]?.lon ?? null, is_hidden: hidden }
      }));

      const label = report.poi_name || report.poi_id;
      if (hidden) {
        // Nascondere risolve la segnalazione: il problema è stato gestito.
        await resolveReport(report.id, 'resolved');
        setFeedback({ type: 'success', text: `POI "${label}" nascosto dalla mappa. Puoi rimetterlo visibile con "Mostra di nuovo".` });
      } else {
        // Rimettere visibile NON riapre la segnalazione: è una scelta separata
        // dell'admin, che può riaprirla a mano se serve.
        setFeedback({ type: 'success', text: `POI "${label}" di nuovo visibile in mappa.` });
      }
    } catch (e) {
      console.error('Error updating POI visibility:', e);
      setFeedback({ type: 'error', text: hidden ? 'Errore nel nascondere il POI.' : 'Errore nel rendere visibile il POI.' });
    }
  };

  // Il nome del POI apre la posizione su Google Maps. Le coordinate arrivano da
  // shared_pois (poi_reports non le ha); se il POI non esiste più o è senza
  // coordinate copiamo l'id, l'unica cosa con cui l'admin può ritrovarlo.
  const openPoiOnMap = async (report: PoiReport) => {
    const info = poiInfo[report.poi_id];
    if (info && typeof info.lat === 'number' && typeof info.lon === 'number') {
      window.open(`https://www.google.com/maps?q=${info.lat},${info.lon}`, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      await navigator.clipboard.writeText(report.poi_id);
      setFeedback({ type: 'info', text: `Coordinate non disponibili: id "${report.poi_id}" copiato negli appunti, cercalo in Editor POI.` });
    } catch {
      setFeedback({ type: 'info', text: `Coordinate non disponibili. Id del POI: ${report.poi_id} — cercalo in Editor POI.` });
    }
  };

  // L'export deve contenere TUTTE le segnalazioni del filtro attivo, non solo
  // la pagina a schermo: rifà la query senza paginazione, con un tetto di
  // sicurezza a 5000 righe.
  async function exportCSV() {
    setFeedback({ type: 'info', text: 'Preparo il CSV...' });
    try {
      const applySearch = await buildSearchFilter();
      let query: any = supabase.from('poi_reports').select('*');
      if (filter !== 'all') query = query.eq('status', filter);
      query = applySearch(query);

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .range(0, 4999);
      if (error) throw error;

      const allRows = data || [];
      const userIds = [...new Set(allRows.map((r: any) => r.user_id).filter(Boolean))];
      const emailMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, email')
          .in('id', userIds);
        (profiles || []).forEach((p: any) => { emailMap[p.id] = p.email || p.id; });
      }

      const header = 'Data,Utente,POI,Tipo Errore,Stato,Dettagli';
      const rows = allRows.map((r: any) => {
        const d = new Date(r.created_at);
        const email = r.user_id ? (emailMap[r.user_id] || r.user_id) : 'Anonimo';
        return `"${d.toLocaleString('it-IT')}","${email}","${r.poi_name}","${r.error_type}","${r.status}","${(r.details || '').replace(/"/g, "''")}"`
      });
      const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'segnalazioni.csv'; a.click();
      URL.revokeObjectURL(url);
      setFeedback({ type: 'success', text: `Esportate ${rows.length} segnalazioni.` });
    } catch (e) {
      console.error('Error exporting reports:', e);
      setFeedback({ type: 'error', text: 'Errore durante l\'export CSV.' });
    }
  }

  // Azioni della riga: identiche in tabella e nel modale, così non possono
  // divergere. Non è un componente separato per non far rimontare i bottoni
  // (e perdere la conferma armata) a ogni render.
  const renderActions = (report: PoiReport, wrap: boolean) => {
    const info = poiInfo[report.poi_id];
    const btn = 'px-2.5 py-1.5 rounded-lg text-[11px] font-black border transition-colors flex items-center gap-1';
    const reopenKey = `reopen:${report.id}`;
    const hideKey = `hide:${report.id}`;
    const showKey = `show:${report.id}`;
    return (
      <div className={`flex items-center gap-1.5 ${wrap ? 'flex-wrap' : ''}`}>
        {report.status === 'pending' ? (
          <>
            <button
              onClick={() => resolveReport(report.id, 'resolved')}
              className={`${btn} bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100`}
            >
              <Check className="w-3 h-3" /> Risolvi
            </button>
            <button
              onClick={() => resolveReport(report.id, 'rejected')}
              className={`${btn} bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100`}
            >
              <XCircle className="w-3 h-3" /> Rigetta
            </button>
          </>
        ) : (
          <button
            onClick={() => guarded(reopenKey, () => resolveReport(report.id, 'pending'))}
            title="Rimette la segnalazione in coda come 'In attesa'"
            className={`${btn} ${isArmed(reopenKey)
              ? 'bg-amber-500 text-white border-amber-500'
              : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'}`}
          >
            <RotateCcw className="w-3 h-3" /> {isArmed(reopenKey) ? 'Sicuro?' : 'Riapri'}
          </button>
        )}

        {/* I bottoni di visibilità compaiono solo se il POI esiste ancora in
            shared_pois: su una riga fantasma non farebbero nulla. */}
        {info && (info.is_hidden ? (
          <button
            onClick={() => guarded(showKey, () => setPoiHidden(report, false))}
            title="Rimette il POI visibile in mappa per tutti gli utenti"
            className={`${btn} ${isArmed(showKey)
              ? 'bg-sky-600 text-white border-sky-600'
              : 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100'}`}
          >
            <Eye className="w-3 h-3" /> {isArmed(showKey) ? 'Sicuro?' : 'Mostra di nuovo'}
          </button>
        ) : (
          <button
            onClick={() => guarded(hideKey, () => setPoiHidden(report, true))}
            title="Nasconde il POI dalla mappa per tutti gli utenti (reversibile)"
            className={`${btn} ${isArmed(hideKey)
              ? 'bg-red-600 text-white border-red-600'
              : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'}`}
          >
            <EyeOff className="w-3 h-3" /> {isArmed(hideKey) ? 'Sicuro?' : 'Nascondi'}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <Flag className="w-6 h-6 text-orange-500" />
            Segnalazioni Utenti
          </h2>
          <p className="text-sm text-on-surface-variant mt-1">Gestisci i report inviati dagli utenti su POI errati, duplicati o inappropriati.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchReports} disabled={isLoading} className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-primary' : 'text-gray-500'}`} />
          </button>
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-black hover:bg-emerald-100 transition-colors">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {/* KPI Cards (cliccabili = filtro) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div
          className={`rounded-2xl p-4 text-center cursor-pointer transition-all border-2 ${filter === 'pending' ? 'border-orange-400 bg-orange-50' : 'border-transparent bg-orange-50/50 hover:border-orange-200'}`}
          onClick={() => changeFilter('pending')}
        >
          <div className="text-3xl font-black text-orange-700">{counts.pending}</div>
          <div className="text-[11px] font-black uppercase tracking-widest text-orange-500 mt-1 flex items-center justify-center gap-1">
            {counts.pending > 0 && <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />}
            In attesa
          </div>
        </div>
        <div
          className={`rounded-2xl p-4 text-center cursor-pointer transition-all border-2 ${filter === 'resolved' ? 'border-emerald-400 bg-emerald-50' : 'border-transparent bg-emerald-50/50 hover:border-emerald-200'}`}
          onClick={() => changeFilter('resolved')}
        >
          <div className="text-3xl font-black text-emerald-700">{counts.resolved}</div>
          <div className="text-[11px] font-black uppercase tracking-widest text-emerald-500 mt-1">Risolte</div>
        </div>
        <div
          className={`rounded-2xl p-4 text-center cursor-pointer transition-all border-2 ${filter === 'rejected' ? 'border-red-400 bg-red-50' : 'border-transparent bg-red-50/40 hover:border-red-200'}`}
          onClick={() => changeFilter('rejected')}
        >
          <div className="text-3xl font-black text-red-700">{counts.rejected}</div>
          <div className="text-[11px] font-black uppercase tracking-widest text-red-500 mt-1">Rigettate</div>
        </div>
        <div
          className={`rounded-2xl p-4 text-center cursor-pointer transition-all border-2 ${filter === 'all' ? 'border-primary bg-blue-50' : 'border-transparent bg-slate-50/50 hover:border-slate-200'}`}
          onClick={() => changeFilter('all')}
        >
          {/* Il totale vero, non le righe della pagina: con la paginazione
              server-side `reports` contiene solo le 50 correnti. */}
          <div className="text-3xl font-black text-slate-700">{totalCount}</div>
          <div className="text-[11px] font-black uppercase tracking-widest text-slate-500 mt-1">Totali</div>
        </div>
      </div>

      {/* Alert per segnalazioni pendenti */}
      {counts.pending > 0 && (
        <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl flex items-center gap-3 text-sm font-medium text-orange-800">
          <Bell className="w-5 h-5 text-orange-500 shrink-0 animate-pulse" />
          <span>Hai <strong>{counts.pending}</strong> segnalazione/i in attesa di revisione. Agisci al più presto per mantenere la qualità dei dati!</span>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Cerca per POI, utente, tipo..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-8 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Reports Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Data', 'Utente', 'Luogo', 'Tipo Segnalazione', 'Dettagli', 'Stato', 'Azioni'].map(h => (
                  <th key={h} className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-primary/60 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr><td colSpan={7} className="p-8 text-center text-sm text-gray-500">Caricamento...</td></tr>
              ) : reports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                    <div className="text-sm font-bold text-gray-500">Nessuna segnalazione trovata.</div>
                  </td>
                </tr>
              ) : reports.map(report => {
                const d = new Date(report.created_at);
                const errInfo = getErrorTypeInfo(report.error_type);
                const isPending = report.status === 'pending';
                return (
                  <tr key={report.id} className={`hover:bg-gray-50/60 transition-colors ${isPending ? 'bg-orange-50/20' : ''}`}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-xs font-bold text-on-surface">{d.toLocaleDateString('it-IT')}</div>
                      <div className="text-[10px] text-gray-500 font-mono">{d.toLocaleTimeString('it-IT')}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-primary/10 rounded-lg text-primary text-xs font-black flex items-center justify-center uppercase shrink-0">
                          {(report.user_email || 'A')[0]}
                        </div>
                        <div className="text-xs font-medium text-on-surface max-w-[130px] truncate" title={report.user_email}>
                          {report.user_email}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                        <span className="text-xs font-bold text-on-surface max-w-[120px] truncate" title={report.poi_name}>
                          {report.poi_name || report.poi_id}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border ${errInfo.color}`}>
                        {errInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[160px]">
                      <div className="text-xs text-gray-600 truncate" title={report.details || ''}>
                        {report.details || <span className="text-gray-500 italic">Nessun dettaglio</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {report.status === 'pending' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 border border-orange-200 rounded-full text-[10px] font-black">
                          <Clock className="w-3 h-3" /> In attesa
                        </span>
                      ) : report.status === 'resolved' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-black">
                          <CheckCircle2 className="w-3 h-3" /> Risolta
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 border border-red-200 rounded-full text-[10px] font-black">
                          <XCircle className="w-3 h-3" /> Rigettata
                        </span>
                      )}
                    </td>
                    {/* Azioni tutte da renderActions: risolvi/rigetta quando e'
                        in attesa, riapri quando e' gia' gestita, piu'
                        nascondi/mostra il POI. Prima una segnalazione chiusa
                        diceva solo "Gestita" e non si poteva piu' toccare. */}
                    <td className="px-4 py-3">{renderActions(report, true)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
