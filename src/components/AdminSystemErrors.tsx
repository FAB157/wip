import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  AlertTriangle, RefreshCw, Trash2, CheckCircle2, XCircle,
  Search, Download, Shield, Layers, List, Users
} from 'lucide-react';

type ErrorSeverity = 'critical' | 'warning' | 'info';

function getSeverity(source: string, message: string, level?: string): ErrorSeverity {
  // Il livello esplicito (colonna `level` del nuovo schema) vince sulle euristiche
  if (level === 'critical' || level === 'error') return 'critical';
  if (level === 'warning') return 'warning';
  if (level === 'info') return 'info';
  const lower = (message || '').toLowerCase() + (source || '').toLowerCase();
  if (lower.includes('network') || lower.includes('timeout') || lower.includes('429') || lower.includes('500') || lower.includes('api key') || lower.includes('circuit')) return 'critical';
  if (lower.includes('fallback') || lower.includes('retry') || lower.includes('limit') || lower.includes('quota')) return 'warning';
  return 'info';
}

// Normalizza un messaggio per il raggruppamento: numeri, uuid e url variabili
// diventano segnaposto, così "HTTP 500 su /api/poi/123" e "...su /api/poi/456"
// sono lo stesso gruppo.
function normalizeMessage(msg: string): string {
  return String(msg || 'Errore sconosciuto')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '{id}')
    .replace(/https?:\/\/[^\s"']+/gi, (u) => u.split('?')[0].replace(/\d+/g, '{n}'))
    .replace(/\d+/g, '{n}')
    .trim()
    .slice(0, 160);
}

const severityConfig: Record<ErrorSeverity, { label: string; rowClass: string; badgeClass: string; icon: React.ReactNode }> = {
  critical: {
    label: 'Critico',
    rowClass: 'bg-red-50/40',
    badgeClass: 'bg-red-100 text-red-700 border border-red-200',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
  warning: {
    label: 'Avviso',
    rowClass: 'bg-amber-50/30',
    badgeClass: 'bg-amber-100 text-amber-700 border border-amber-200',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  info: {
    label: 'Info',
    rowClass: '',
    badgeClass: 'bg-slate-100 text-slate-600 border border-slate-200',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
};

// Mini-sparkline a barre degli ultimi 14 giorni (solo div, niente librerie)
function Trend({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  return (
    <div className="flex items-end gap-[2px] h-6" title={`Occorrenze negli ultimi ${counts.length} giorni (oggi a destra)`}>
      {counts.map((c, i) => (
        <div
          key={i}
          className={`w-[5px] rounded-sm ${c > 0 ? 'bg-red-400' : 'bg-slate-200'}`}
          style={{ height: `${c > 0 ? Math.max(20, (c / max) * 100) : 12}%` }}
        />
      ))}
    </div>
  );
}

export default function AdminSystemErrors() {
  const [errors, setErrors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'groups' | 'list'>('groups');
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const fetchErrors = async () => {
    setLoading(true);
    try {
      let allData: any[] = [];
      let from = 0;
      const step = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('system_errors')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + step - 1);

        if (error) {
          // 42P01 = tabella inesistente (Postgres), PGRST205 = tabella non in
          // schema cache (PostgREST): entrambi = migrazione
          // 20260807120000_admin_observability.sql non ancora applicata.
          if (error.code !== '42P01' && error.code !== 'PGRST205') console.error('Error fetching system errors:', error);
          hasMore = false;
        } else if (data && data.length > 0) {
          allData = [...allData, ...data];
          from += step;
          if (data.length < step) hasMore = false;
        } else {
          hasMore = false;
        }
      }

      setErrors(allData);
    } catch (e) {
      console.error('Caught error:', e);
    }
    setLoading(false);
    setPage(0);
  };

  const clearErrors = async () => {
    if (!window.confirm('Sei sicuro di voler eliminare TUTTI gli errori di sistema?')) return;
    setLoading(true);
    try {
      // not-null matcha ogni riga qualunque sia il tipo di id: il vecchio
      // gte('id', 0) falliva sugli id uuid e l'errore veniva inghiottito
      // mentre la UI mostrava la lista vuota (falso successo).
      const { error } = await supabase.from('system_errors').delete().not('id', 'is', null);
      if (error) throw error;
      setErrors([]);
    } catch (e: any) {
      alert('Pulizia fallita: ' + (e?.message || e));
    }
    setLoading(false);
  };

  useEffect(() => { fetchErrors(); }, []);

  // Campi unificati tra schema nuovo (message/level/context) e legacy
  // (error_message/details): il pannello mostrava vuoto le righe nuove.
  const enriched = useMemo(() => errors.map(e => {
    const msg = e.error_message || e.message || '';
    const ctx = (e.context && typeof e.context === 'object') ? e.context : null;
    const det = e.details || (ctx ? JSON.stringify(ctx) : '');
    return {
      ...e,
      msg,
      det,
      userId: ctx?.userId || null,
      platform: ctx?.platform || null,
      severity: getSeverity(e.source, msg, e.level),
      normKey: `${e.source || 'n/d'}::${normalizeMessage(msg)}`,
    };
  }), [errors]);

  // Statistiche di testa
  const now = Date.now();
  const last24h = enriched.filter(e => now - new Date(e.created_at).getTime() < 86400000);
  const criticalCount = enriched.filter(e => e.severity === 'critical').length;
  const affectedUsers = new Set(enriched.filter(e => e.userId).map(e => e.userId)).size;

  // Raggruppamento per messaggio normalizzato + trend giornaliero 14gg
  const groups = useMemo(() => {
    const map = new Map<string, any>();
    for (const e of enriched) {
      let g = map.get(e.normKey);
      if (!g) {
        g = { key: e.normKey, sample: e.msg, source: e.source || 'n/d', severity: e.severity, count: 0, users: new Set(), platforms: new Set(), first: e.created_at, last: e.created_at, daily: new Array(14).fill(0) };
        map.set(e.normKey, g);
      }
      g.count++;
      if (e.userId) g.users.add(e.userId);
      if (e.platform) g.platforms.add(e.platform);
      if (e.created_at < g.first) g.first = e.created_at;
      if (e.created_at > g.last) g.last = e.created_at;
      if (e.severity === 'critical') g.severity = 'critical';
      else if (e.severity === 'warning' && g.severity === 'info') g.severity = 'warning';
      const dayDiff = Math.floor((now - new Date(e.created_at).getTime()) / 86400000);
      if (dayDiff >= 0 && dayDiff < 14) g.daily[13 - dayDiff]++;
    }
    return [...map.values()].sort((a, b) => (b.last > a.last ? 1 : -1));
  }, [enriched]);

  // Filtro + ricerca (condivisi dalle due viste)
  const q = search.toLowerCase();
  const filtered = enriched.filter(e => {
    const matchSev = filter === 'all' || e.severity === filter;
    const matchSearch = !search || (e.source || '').toLowerCase().includes(q) || (e.msg || '').toLowerCase().includes(q) || (e.det || '').toLowerCase().includes(q);
    return matchSev && matchSearch;
  });
  const filteredGroups = groups.filter(g => {
    const matchSev = filter === 'all' || g.severity === filter;
    const matchSearch = !search || g.source.toLowerCase().includes(q) || (g.sample || '').toLowerCase().includes(q);
    return matchSev && matchSearch;
  });
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  function exportCSV() {
    const header = 'Data,Sorgente,Severita,Messaggio,Dettagli';
    const rows = filtered.map(e => {
      const d = new Date(e.created_at);
      return `"${d.toLocaleString('it-IT')}","${e.source}","${e.severity}","${(e.msg || '').replace(/"/g, "''")}","${(e.det || '').replace(/"/g, "''")}"`;
    });
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `system_errors_${new Date().toISOString().split('T')[0]}.csv`; a.click();
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <Shield className="w-6 h-6 text-red-500" />
            Errori di Sistema
          </h2>
          <p className="text-sm text-on-surface-variant mt-1">Errori applicativi raggruppati per tipo, con trend e utenti colpiti.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchErrors} disabled={loading} className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors" title="Ricarica">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-primary' : 'text-gray-500'}`} />
          </button>
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-xs font-black hover:bg-blue-100 transition-colors">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
          <button onClick={clearErrors} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-black hover:bg-red-100 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Pulisci
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-red-50 border border-red-200/60 rounded-2xl p-4 text-center">
          <div className="text-3xl font-black text-red-700">{last24h.length}</div>
          <div className="text-[11px] font-black uppercase tracking-widest text-red-500 mt-1">Ultime 24h</div>
        </div>
        <div className="bg-orange-50 border border-orange-200/60 rounded-2xl p-4 text-center">
          <div className="text-3xl font-black text-orange-700">{criticalCount}</div>
          <div className="text-[11px] font-black uppercase tracking-widest text-orange-500 mt-1">Critici totali</div>
        </div>
        <div className="bg-violet-50 border border-violet-200/60 rounded-2xl p-4 text-center">
          <div className="text-3xl font-black text-violet-700">{groups.length}</div>
          <div className="text-[11px] font-black uppercase tracking-widest text-violet-500 mt-1">Tipi di errore</div>
        </div>
        <div className="bg-sky-50 border border-sky-200/60 rounded-2xl p-4 text-center">
          <div className="text-3xl font-black text-sky-700">{affectedUsers}</div>
          <div className="text-[11px] font-black uppercase tracking-widest text-sky-500 mt-1">Utenti colpiti</div>
        </div>
      </div>

      {/* Vista + filtri */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          <button
            onClick={() => setView('groups')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${view === 'groups' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-primary'}`}
          >
            <Layers className="w-3.5 h-3.5" /> Gruppi
          </button>
          <button
            onClick={() => setView('list')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${view === 'list' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-primary'}`}
          >
            <List className="w-3.5 h-3.5" /> Elenco
          </button>
        </div>
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {(['all', 'critical', 'warning', 'info'] as const).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(0); }}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${
                filter === f ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-primary'
              }`}
            >
              {f === 'all' ? 'Tutti' : f === 'critical' ? 'Critici' : f === 'warning' ? 'Avvisi' : 'Info'}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cerca in sorgente, messaggio, dettagli..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-8 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="text-xs text-gray-500 font-medium">
          {view === 'groups' ? `${filteredGroups.length} gruppi` : `${filtered.length.toLocaleString('it-IT')} risultati`}
        </div>
      </div>

      {/* Vista GRUPPI: un tipo di errore per riga, col trend a 14 giorni */}
      {view === 'groups' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Severità', 'Tipo di errore', 'Occorrenze', 'Utenti', 'Trend 14gg', 'Primo / Ultimo'].map(h => (
                    <th key={h} className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-primary/60 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-sm text-gray-500">Caricamento...</td></tr>
                ) : filteredGroups.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                      <div className="text-sm font-bold text-gray-500">Nessun errore trovato. Tutto funziona!</div>
                    </td>
                  </tr>
                ) : filteredGroups.map(g => {
                  const sev = severityConfig[g.severity as ErrorSeverity];
                  return (
                    <tr
                      key={g.key}
                      className={`hover:bg-gray-50/60 transition-colors cursor-pointer ${sev.rowClass}`}
                      title="Apri le occorrenze di questo gruppo nell'elenco"
                      onClick={() => { setSearch(g.sample.slice(0, 40)); setView('list'); setPage(0); }}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black ${sev.badgeClass}`}>
                          {sev.icon} {sev.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-md">
                        <div className="text-xs font-bold text-on-surface break-words">{g.sample}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">
                          <span className="px-1.5 py-0.5 bg-slate-100 rounded font-black">{g.source}</span>
                          {g.platforms.size > 0 && <span className="ml-1.5">{[...g.platforms].join(' · ')}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-black text-on-surface tabular-nums">{g.count.toLocaleString('it-IT')}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-sky-700 tabular-nums">
                          <Users className="w-3.5 h-3.5" /> {g.users.size}
                        </span>
                      </td>
                      <td className="px-4 py-3"><Trend counts={g.daily} /></td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-[10px] text-gray-500 font-mono">{new Date(g.first).toLocaleDateString('it-IT')}</div>
                        <div className="text-xs font-bold text-on-surface">{new Date(g.last).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Vista ELENCO: le singole occorrenze, con paginazione */}
      {view === 'list' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Severità', 'Data & Ora', 'Sorgente', 'Messaggio d\'Errore', 'Dettagli'].map(h => (
                    <th key={h} className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-primary/60 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={5} className="p-8 text-center text-sm text-gray-500">Caricamento...</td></tr>
                ) : paged.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                      <div className="text-sm font-bold text-gray-500">Nessun errore trovato. Tutto funziona!</div>
                    </td>
                  </tr>
                ) : paged.map(err => {
                  const sev = severityConfig[err.severity as ErrorSeverity];
                  const d = new Date(err.created_at);
                  return (
                    <tr key={err.id} className={`hover:bg-gray-50/60 transition-colors ${sev.rowClass}`}>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black ${sev.badgeClass}`}>
                          {sev.icon} {sev.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-xs font-bold text-on-surface">{d.toLocaleDateString('it-IT')}</div>
                        <div className="text-[10px] text-gray-500 font-mono">{d.toLocaleTimeString('it-IT')}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-lg text-[11px] font-black border border-slate-200">
                          {err.source || 'N/D'}
                        </span>
                        {err.platform && <div className="text-[10px] text-gray-500 mt-1">{err.platform}</div>}
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <div className="text-xs font-medium text-red-700 break-words">{err.msg}</div>
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <div className="text-[11px] font-mono text-gray-500 truncate" title={err.det}>{err.det || '—'}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="p-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">Pagina {page + 1} di {totalPages}</span>
              <div className="flex gap-2">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 text-xs font-black text-primary border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">← Prec.</button>
                <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 text-xs font-black text-primary border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">Succ. →</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
