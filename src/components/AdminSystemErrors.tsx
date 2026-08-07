import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  AlertTriangle, RefreshCw, Trash2, CheckCircle2, XCircle, Clock,
  Filter, Search, ChevronDown, Download, Bell, User, Globe, Shield
} from 'lucide-react';

type ErrorSeverity = 'critical' | 'warning' | 'info';

function getSeverity(source: string, message: string): ErrorSeverity {
  const lower = (message || '').toLowerCase() + (source || '').toLowerCase();
  if (lower.includes('network') || lower.includes('timeout') || lower.includes('429') || lower.includes('500') || lower.includes('api key') || lower.includes('circuit')) return 'critical';
  if (lower.includes('fallback') || lower.includes('retry') || lower.includes('limit') || lower.includes('quota')) return 'warning';
  return 'info';
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

export default function AdminSystemErrors() {
  const [errors, setErrors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
          if (error.code !== '42P01') console.error('Error fetching system errors:', error);
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

  // Enrich with severity
  const enriched = errors.map(e => ({ ...e, severity: getSeverity(e.source, e.error_message) }));

  // Stats
  const criticalCount = enriched.filter(e => e.severity === 'critical').length;
  const warningCount = enriched.filter(e => e.severity === 'warning').length;
  const infoCount = enriched.filter(e => e.severity === 'info').length;

  // Filter + search
  const filtered = enriched.filter(e => {
    const matchSev = filter === 'all' || e.severity === filter;
    const q = search.toLowerCase();
    const matchSearch = !search || (e.source || '').toLowerCase().includes(q) || (e.error_message || '').toLowerCase().includes(q) || (e.details || '').toLowerCase().includes(q);
    return matchSev && matchSearch;
  });
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  function exportCSV() {
    const header = 'Data,Sorgente,Severita,Messaggio,Dettagli';
    const rows = filtered.map(e => {
      const d = new Date(e.created_at);
      return `"${d.toLocaleString('it-IT')}","${e.source}","${e.severity}","${(e.error_message || '').replace(/"/g, "''")}","${(e.details || '').replace(/"/g, "''")}"`;
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
          <p className="text-sm text-on-surface-variant mt-1">Log completo degli errori applicativi e delle anomalie API.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchErrors} disabled={loading} className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
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

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-red-50 border border-red-200/60 rounded-2xl p-4 text-center">
          <div className="text-3xl font-black text-red-700">{criticalCount}</div>
          <div className="text-[11px] font-black uppercase tracking-widest text-red-500 mt-1">Critici</div>
        </div>
        <div className="bg-amber-50 border border-amber-200/60 rounded-2xl p-4 text-center">
          <div className="text-3xl font-black text-amber-700">{warningCount}</div>
          <div className="text-[11px] font-black uppercase tracking-widest text-amber-500 mt-1">Avvisi</div>
        </div>
        <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 text-center">
          <div className="text-3xl font-black text-slate-600">{infoCount}</div>
          <div className="text-[11px] font-black uppercase tracking-widest text-slate-400 mt-1">Info</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
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
          {filtered.length.toLocaleString('it-IT')} risultati
        </div>
      </div>

      {/* Table */}
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
                <tr><td colSpan={5} className="p-8 text-center text-sm text-gray-400">Caricamento...</td></tr>
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
                      <div className="text-[10px] text-gray-400 font-mono">{d.toLocaleTimeString('it-IT')}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-lg text-[11px] font-black border border-slate-200">
                        {err.source || 'N/D'}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="text-xs font-medium text-red-700 break-words">{err.error_message}</div>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <div className="text-[11px] font-mono text-gray-500 truncate" title={err.details}>{err.details || '—'}</div>
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
    </div>
  );
}
