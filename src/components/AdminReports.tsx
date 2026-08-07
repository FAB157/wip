import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  Flag, CheckCircle2, AlertTriangle, Search, Clock, Check, XCircle,
  RefreshCw, Trash2, Eye, EyeOff, MapPin, User, Filter, Download, Bell
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

export default function AdminReports() {
  const [reports, setReports] = useState<PoiReport[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<'pending' | 'resolved' | 'rejected' | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [selectedReport, setSelectedReport] = useState<PoiReport | null>(null);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('poi_reports')
        .select('*')
        .order('created_at', { ascending: false });

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

      const enriched = rawReports.map((r: any) => ({
        ...r,
        user_email: r.user_id ? (emailMap[r.user_id] || r.user_id) : 'Anonimo',
      }));

      setReports(enriched);
    } catch (e) {
      console.error('Error fetching reports:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const resolveReport = async (id: string, status: 'resolved' | 'rejected') => {
    try {
      const { error } = await supabase
        .from('poi_reports')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
      setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
      if (selectedReport?.id === id) setSelectedReport(prev => prev ? { ...prev, status } : null);
      // Aggiorna il badge "Segnalazioni" sul tab del pannello admin
      window.dispatchEvent(new CustomEvent('wip-reports-updated'));
    } catch (e) {
      console.error('Error resolving report:', e);
      alert('Errore aggiornamento stato');
    }
  };

  const hidePoi = async (poi_id: string, report_id: string) => {
    if (!window.confirm(`Vuoi davvero nascondere il POI "${poi_id}" dalla mappa per tutti gli utenti?`)) return;
    try {
      const { error: poiErr } = await supabase
        .from('shared_pois')
        .update({ is_hidden: true })
        .eq('id', poi_id);
      if (poiErr) throw poiErr;
      await resolveReport(report_id, 'resolved');
      alert('POI nascosto con successo.');
    } catch (e) {
      console.error('Error hiding POI:', e);
      alert('Errore nel nascondere il POI');
    }
  };

  const pendingCount = reports.filter(r => r.status === 'pending').length;
  const resolvedCount = reports.filter(r => r.status === 'resolved').length;
  const rejectedCount = reports.filter(r => r.status === 'rejected').length;

  const filteredReports = reports.filter(r => {
    const matchStatus = filter === 'all' || r.status === filter;
    const q = search.toLowerCase();
    const matchSearch = !search || (r.poi_name || '').toLowerCase().includes(q) || (r.details || '').toLowerCase().includes(q) || (r.user_email || '').toLowerCase().includes(q) || (r.error_type || '').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  function exportCSV() {
    const header = 'Data,Utente,POI,Tipo Errore,Stato,Dettagli';
    const rows = filteredReports.map(r => {
      const d = new Date(r.created_at);
      return `"${d.toLocaleString('it-IT')}","${r.user_email}","${r.poi_name}","${r.error_type}","${r.status}","${(r.details || '').replace(/"/g, "''")}"`
    });
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'segnalazioni.csv'; a.click();
  }

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
          onClick={() => setFilter('pending')}
        >
          <div className="text-3xl font-black text-orange-700">{pendingCount}</div>
          <div className="text-[11px] font-black uppercase tracking-widest text-orange-500 mt-1 flex items-center justify-center gap-1">
            {pendingCount > 0 && <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />}
            In attesa
          </div>
        </div>
        <div
          className={`rounded-2xl p-4 text-center cursor-pointer transition-all border-2 ${filter === 'resolved' ? 'border-emerald-400 bg-emerald-50' : 'border-transparent bg-emerald-50/50 hover:border-emerald-200'}`}
          onClick={() => setFilter('resolved')}
        >
          <div className="text-3xl font-black text-emerald-700">{resolvedCount}</div>
          <div className="text-[11px] font-black uppercase tracking-widest text-emerald-500 mt-1">Risolte</div>
        </div>
        <div
          className={`rounded-2xl p-4 text-center cursor-pointer transition-all border-2 ${filter === 'rejected' ? 'border-red-400 bg-red-50' : 'border-transparent bg-red-50/40 hover:border-red-200'}`}
          onClick={() => setFilter('rejected')}
        >
          <div className="text-3xl font-black text-red-700">{rejectedCount}</div>
          <div className="text-[11px] font-black uppercase tracking-widest text-red-500 mt-1">Rigettate</div>
        </div>
        <div
          className={`rounded-2xl p-4 text-center cursor-pointer transition-all border-2 ${filter === 'all' ? 'border-primary bg-blue-50' : 'border-transparent bg-slate-50/50 hover:border-slate-200'}`}
          onClick={() => setFilter('all')}
        >
          <div className="text-3xl font-black text-slate-700">{reports.length}</div>
          <div className="text-[11px] font-black uppercase tracking-widest text-slate-500 mt-1">Totali</div>
        </div>
      </div>

      {/* Alert per segnalazioni pendenti */}
      {pendingCount > 0 && (
        <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl flex items-center gap-3 text-sm font-medium text-orange-800">
          <Bell className="w-5 h-5 text-orange-500 shrink-0 animate-pulse" />
          <span>Hai <strong>{pendingCount}</strong> segnalazione/i in attesa di revisione. Agisci al più presto per mantenere la qualità dei dati!</span>
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
                <tr><td colSpan={7} className="p-8 text-center text-sm text-gray-400">Caricamento...</td></tr>
              ) : filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                    <div className="text-sm font-bold text-gray-500">Nessuna segnalazione trovata.</div>
                  </td>
                </tr>
              ) : filteredReports.map(report => {
                const d = new Date(report.created_at);
                const errInfo = getErrorTypeInfo(report.error_type);
                const isPending = report.status === 'pending';
                return (
                  <tr key={report.id} className={`hover:bg-gray-50/60 transition-colors ${isPending ? 'bg-orange-50/20' : ''}`}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-xs font-bold text-on-surface">{d.toLocaleDateString('it-IT')}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{d.toLocaleTimeString('it-IT')}</div>
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
                        {report.details || <span className="text-gray-400 italic">Nessun dettaglio</span>}
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
                    <td className="px-4 py-3">
                      {isPending ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => resolveReport(report.id, 'resolved')}
                            className="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-black hover:bg-emerald-100 transition-colors flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" /> Risolvi
                          </button>
                          <button
                            onClick={() => hidePoi(report.poi_id, report.id)}
                            className="px-2.5 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-[11px] font-black hover:bg-red-100 transition-colors flex items-center gap-1"
                          >
                            <EyeOff className="w-3 h-3" /> Nascondi
                          </button>
                          <button
                            onClick={() => resolveReport(report.id, 'rejected')}
                            className="px-2.5 py-1.5 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg text-[11px] font-black hover:bg-gray-100 transition-colors flex items-center gap-1"
                          >
                            <XCircle className="w-3 h-3" /> Rigetta
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Gestita</span>
                      )}
                    </td>
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
