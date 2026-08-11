import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  BarChart3, RefreshCw, Activity, Database, Server, Calendar as CalendarIcon,
  DollarSign, AlertTriangle, Search, User, ChevronDown, ChevronUp, TrendingUp,
  Zap, Globe, Download, Filter, X
} from 'lucide-react';

const COST_MAP: Record<string, number> = {
  'generazione_itinerari': 0.00056,
  'itinerary_day': 0.00056,
  'premium_guide_day': 0.00084,
  'podcast_generation': 0.00105,
  'generazione_podcast': 0.00105,
  'itinerary_creation': 0.00045,
  'vision_recognition': 0.00070,
  'camera_monument_scan': 0.00070,
  'poi_enrichment': 0.00070,
  'streaming_enrichment': 0.00070,
  'audioguide_tts': 0.02290,
  'sintesi_vocale_tts': 0.02290,
  'moving_logic': 0.00010,
  'deepseek-chat': 0.00020,
  'deepseek_v4_flash': 0.00020,
  'groq-llama-3.3-70b-versatile': 0.00,
  'groq_llama': 0.00,
  'gemini_flash': 0.005,
  'gemini_vision': 0.005,
  'azure': 0.015,
  'google_tts': 0.015,
  'elevenlabs': 0.035,
  'overpass': 0.00,
  'wikipedia': 0.00,
  'foursquare': 0.005,
  'ticketmaster': 0.00,
  'virgilio': 0.00,
  'viator': 0.00,
  'getyourguide': 0.00,
  'tripadvisor': 0.00,
  'google_places': 0.02,
};

function getCost(feature_context: string, api_name: string): number {
  if (feature_context && COST_MAP[feature_context] !== undefined) return COST_MAP[feature_context];
  if (api_name && COST_MAP[api_name] !== undefined) return COST_MAP[api_name];
  return 0.01;
}

function computeCost(row: any): number {
  const feature = row.feature_context || '';
  const api = (row.api_name || '').toLowerCase();
  const tokens = row.tokens_used || 0;
  if (api.includes('overpass') || api.includes('wikipedia') || api.includes('llama') || api.includes('groq')) return 0;
  if (api.includes('deepseek')) {
    if (tokens > 0) return tokens * (0.20 / 1000000);
    return 0.0005;
  }
  let base = row.cost_estimation;
  if (base === undefined || base === null) base = getCost(feature, api);
  return base;
}

type TimeFilter = 'oggi' | 'ieri' | 'mese' | 'tutto';

/**
 * I log storici annegano i metadati nel testo del feature_context
 * ("poi_enrichment | Token: 1234 | User: <uuid>"). Qui li estraiamo:
 * - feature pulita (per aggregare e mostrare senza rumore)
 * - user id (la colonna user_id non è mai stata valorizzata dagli scrittori)
 */
function parseContext(raw: string | null | undefined): { feature: string; ctxUserId: string | null } {
  const s = (raw || '').trim();
  if (!s) return { feature: 'Generale', ctxUserId: null };
  const userMatch = s.match(/\|\s*User:\s*([^|]+)/i);
  const uid = userMatch ? userMatch[1].trim() : null;
  const feature = s.split('|')[0].trim() || 'Generale';
  const isRealUid = uid && uid !== 'anonymous' && uid !== 'mock-user-id';
  return { feature, ctxUserId: isRealUid ? uid : null };
}

interface ApiLogRow {
  id: string;
  created_at: string;
  api_name: string;
  feature_context: string;
  cleanFeature: string;
  tokens_used: number;
  cost_estimation: number | null;
  user_id: string | null;
  resolvedUserId: string | null;
  user_email?: string;
  computedCost: number;
}

interface AggregatedStat {
  key: string;
  api_name: string;
  feature_context: string;
  count: number;
  cost: number;
  tokens: number;
}

export default function AdminApiStats() {
  const [stats, setStats] = useState<AggregatedStat[]>([]);
  const [rawLogs, setRawLogs] = useState<ApiLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('mese');
  const [alerts, setAlerts] = useState<string[]>([]);

  // Log table state
  const [logSearch, setLogSearch] = useState('');
  const [logApiFilter, setLogApiFilter] = useState('');
  const [logPage, setLogPage] = useState(0);
  const LOG_PAGE_SIZE = 50;
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    setLogPage(0);
    try {
      let allData: any[] = [];
      let from = 0;
      const step = 1000;
      let hasMore = true;
      // Il DB live può non avere le colonne estese (cost_estimation, user_id):
      // in quel caso Postgres risponde 42703 e la tab restava completamente
      // rotta. Si ripiega sulle sole colonne base; computeCost stima il costo
      // e l'utente viene estratto dal feature_context come per i log storici.
      let extendedCols = true;

      while (hasMore) {
        let query = supabase
          .from('api_usage_logs')
          .select(extendedCols
            ? 'id, api_name, feature_context, created_at, tokens_used, cost_estimation, user_id'
            : 'id, api_name, feature_context, created_at, tokens_used');

        const now = new Date();
        if (timeFilter === 'oggi') {
          query = query.gte('created_at', new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString());
        } else if (timeFilter === 'ieri') {
          const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
          const e = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          query = query.gte('created_at', s.toISOString()).lt('created_at', e.toISOString());
        } else if (timeFilter === 'mese') {
          query = query.gte('created_at', new Date(now.getFullYear(), now.getMonth(), 1).toISOString());
        }

        query = query.order('created_at', { ascending: false }).range(from, from + step - 1);
        const { data, error: sbError } = await query;
        if (sbError) {
          if (extendedCols && (sbError.code === '42703' || sbError.message?.includes('does not exist'))) {
            extendedCols = false;
            continue; // riprova la stessa pagina con le colonne base
          }
          throw sbError;
        }

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          from += step;
          if (data.length < step) hasMore = false;
        } else {
          hasMore = false;
        }
      }

      // L'utente può stare nella colonna user_id (mai valorizzata dagli
      // scrittori attuali) O annegato nel feature_context: senza il parse
      // ogni riga risultava "Anonimo" e la ricerca per email era inutile.
      const parsedRows = allData.map((row: any) => {
        const parsed = parseContext(row.feature_context);
        return { row, parsed, uid: row.user_id || parsed.ctxUserId };
      });

      const userIds = [...new Set(parsedRows.map(p => p.uid).filter(Boolean))];
      let emailMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, email')
          .in('id', userIds);
        (profiles || []).forEach((p: any) => { emailMap[p.id] = p.email || p.id; });
      }

      // Enrich logs with computed cost and user email
      const enriched: ApiLogRow[] = parsedRows.map(({ row, parsed, uid }) => ({
        ...row,
        cleanFeature: parsed.feature,
        resolvedUserId: uid,
        computedCost: computeCost(row),
        user_email: uid ? (emailMap[uid] || uid) : 'Anonimo',
      }));

      setRawLogs(enriched);

      // Aggregazione sulla feature PULITA: la chiave col context grezzo
      // (che contiene "| Token: 1234 | User: uuid" quasi unici) frantumava
      // il riepilogo in gruppi da 1 chiamata, rendendolo illeggibile e
      // disinnescando l'alert sulle 100+ chiamate.
      const counts: Record<string, { count: number; api: string; feature: string; totalCost: number; totalTokens: number }> = {};
      enriched.forEach(row => {
        const feature = row.cleanFeature;
        const api = row.api_name || 'Sconosciuta';
        const key = `${api}_${feature}`;
        if (!counts[key]) counts[key] = { count: 0, api, feature, totalCost: 0, totalTokens: 0 };
        counts[key].count += 1;
        counts[key].totalCost += row.computedCost;
        counts[key].totalTokens += row.tokens_used || 0;
      });

      const formattedStats: AggregatedStat[] = Object.entries(counts).map(([key, val]) => ({
        key,
        api_name: val.api,
        feature_context: val.feature,
        count: val.count,
        cost: val.totalCost,
        tokens: val.totalTokens,
      })).sort((a, b) => b.cost - a.cost);

      setStats(formattedStats);

      // Alerts
      const newAlerts: string[] = [];
      formattedStats.forEach(stat => {
        if (timeFilter === 'oggi' && stat.count > 100) {
          newAlerts.push(`⚠️ L'API "${stat.api_name}" per "${stat.feature_context}" ha superato le 100 chiamate oggi (${stat.count}).`);
        }
      });
      setAlerts(newAlerts);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, [timeFilter]);

  const totalCalls = stats.reduce((acc, curr) => acc + curr.count, 0);
  const totalCost = stats.reduce((acc, curr) => acc + curr.cost, 0);
  const totalTokens = stats.reduce((acc, curr) => acc + curr.tokens, 0);

  // Filtered + paginated logs
  const uniqueApis = [...new Set(rawLogs.map(r => r.api_name).filter(Boolean))];
  const filteredLogs = rawLogs.filter(r => {
    const matchEmail = !logSearch || (r.user_email || '').toLowerCase().includes(logSearch.toLowerCase());
    const matchApi = !logApiFilter || r.api_name === logApiFilter;
    return matchEmail && matchApi;
  });
  const pagedLogs = filteredLogs.slice(logPage * LOG_PAGE_SIZE, (logPage + 1) * LOG_PAGE_SIZE);
  const totalPages = Math.ceil(filteredLogs.length / LOG_PAGE_SIZE);

  const apiColorMap: Record<string, string> = {
    deepseek: 'bg-blue-100 text-blue-800',
    groq: 'bg-emerald-100 text-emerald-800',
    gemini: 'bg-purple-100 text-purple-800',
    google: 'bg-yellow-100 text-yellow-800',
    elevenlabs: 'bg-pink-100 text-pink-800',
    overpass: 'bg-gray-100 text-gray-700',
    wikipedia: 'bg-gray-100 text-gray-700',
  };
  function getApiColor(api: string): string {
    const lower = (api || '').toLowerCase();
    for (const [k, v] of Object.entries(apiColorMap)) {
      if (lower.includes(k)) return v;
    }
    return 'bg-slate-100 text-slate-700';
  }

  function exportCSV() {
    const header = 'Data,Ora,Utente,API,Feature,Token,Costo ($)';
    const rows = filteredLogs.map(r => {
      const d = new Date(r.created_at);
      return `${d.toLocaleDateString('it-IT')},${d.toLocaleTimeString('it-IT')},"${r.user_email}","${r.api_name}","${r.cleanFeature}",${r.tokens_used || 0},${r.computedCost.toFixed(6)}`;
    });
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `api_logs_${timeFilter}.csv`; a.click();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-500" />
            API Telemetry & Costi Reali
          </h2>
          <p className="text-on-surface-variant mt-1 text-sm">Monitora consumi, spese e tracing utente per ogni singola chiamata API.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-surface border border-outline-variant rounded-xl p-1 shadow-sm">
            {(['oggi', 'ieri', 'mese', 'tutto'] as TimeFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setTimeFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                  timeFilter === f ? 'bg-primary text-white shadow-sm' : 'text-on-surface-variant hover:text-primary'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button onClick={fetchStats} disabled={loading} className="p-2.5 bg-surface border border-outline-variant rounded-xl hover:bg-surface-variant transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-primary' : 'text-on-surface-variant'}`} />
          </button>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm font-medium text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {a}
            </div>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100/40 border border-blue-200/60 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-black uppercase tracking-widest text-blue-600">Chiamate Totali</span>
          </div>
          <div className="text-3xl font-black text-blue-800">{totalCalls.toLocaleString('it-IT')}</div>
          <div className="text-[11px] text-blue-500 mt-1">{stats.length} endpoint distinti</div>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/40 border border-emerald-200/60 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-black uppercase tracking-widest text-emerald-600">Costo Totale Stimato</span>
          </div>
          <div className="text-3xl font-black text-emerald-800">${totalCost.toFixed(4)}</div>
          <div className="text-[11px] text-emerald-500 mt-1">media ${totalCalls > 0 ? (totalCost / totalCalls).toFixed(6) : '0'}/call</div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100/40 border border-purple-200/60 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Server className="w-4 h-4 text-purple-500" />
            <span className="text-xs font-black uppercase tracking-widest text-purple-600">Token Consumati</span>
          </div>
          <div className="text-3xl font-black text-purple-800">{(totalTokens / 1000).toFixed(1)}K</div>
          <div className="text-[11px] text-purple-500 mt-1">{totalTokens.toLocaleString('it-IT')} token totali</div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm font-medium text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Aggregated Stats Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h3 className="font-black text-sm text-primary uppercase tracking-wider">Riepilogo per Endpoint</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['API', 'Feature / Contesto', 'Chiamate', 'Token', 'Costo Totale ($)', '% del Totale'].map(h => (
                  <th key={h} className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-primary/60">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center text-sm text-gray-400">Caricamento...</td></tr>
              ) : stats.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-sm text-gray-400">Nessun dato per il periodo selezionato.</td></tr>
              ) : stats.map((stat) => (
                <tr key={stat.key} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${getApiColor(stat.api_name)}`}>
                      {stat.api_name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-medium text-on-surface-variant max-w-[220px] truncate" title={stat.feature_context}>
                    {stat.feature_context}
                  </td>
                  <td className="px-4 py-3 text-xs font-black text-on-surface">{stat.count.toLocaleString('it-IT')}</td>
                  <td className="px-4 py-3 text-xs font-black text-on-surface">{stat.tokens.toLocaleString('it-IT')}</td>
                  <td className="px-4 py-3 text-xs font-black text-emerald-700">${stat.cost.toFixed(5)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${totalCost > 0 ? Math.min(100, (stat.cost / totalCost) * 100) : 0}%` }} />
                      </div>
                      <span className="text-[10px] font-black text-on-surface-variant w-10 text-right">
                        {totalCost > 0 ? ((stat.cost / totalCost) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* === DETAILED LOG TABLE === */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h3 className="font-black text-sm text-primary uppercase tracking-wider">
                Log Transazioni Dettagliati
              </h3>
              <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-[10px] font-black">
                {filteredLogs.length.toLocaleString('it-IT')} righe
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Email search */}
              <div className="relative">
                <User className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cerca utente / email..."
                  value={logSearch}
                  onChange={e => { setLogSearch(e.target.value); setLogPage(0); }}
                  className="pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20 w-48"
                />
                {logSearch && <button onClick={() => setLogSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X className="w-3 h-3 text-gray-400" /></button>}
              </div>
              {/* API filter */}
              <div className="relative">
                <Filter className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <select
                  value={logApiFilter}
                  onChange={e => { setLogApiFilter(e.target.value); setLogPage(0); }}
                  className="pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20 appearance-none"
                >
                  <option value="">Tutte le API</option>
                  {uniqueApis.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              {/* Export */}
              <button
                onClick={exportCSV}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-black hover:bg-emerald-100 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Data & Ora', 'Utente (Email)', 'API', 'Feature / Contesto', 'Token', 'Costo ($)', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-primary/60 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={7} className="p-8 text-center text-sm text-gray-400">Caricamento transazioni...</td></tr>
              ) : pagedLogs.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-sm text-gray-400">Nessuna transazione trovata.</td></tr>
              ) : pagedLogs.map(row => {
                const d = new Date(row.created_at);
                const isExpanded = expandedRow === row.id;
                const isFreeCost = row.computedCost === 0;
                return (
                  <React.Fragment key={row.id}>
                    <tr className={`hover:bg-gray-50/60 transition-colors ${isExpanded ? 'bg-blue-50/30' : ''}`}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-xs font-bold text-on-surface">{d.toLocaleDateString('it-IT')}</div>
                        <div className="text-[10px] text-gray-400 font-mono">{d.toLocaleTimeString('it-IT')}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-black uppercase shrink-0">
                            {(row.user_email || 'A')[0]}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-on-surface max-w-[160px] truncate" title={row.user_email}>
                              {row.user_email}
                            </div>
                            {row.resolvedUserId && (
                              <div className="text-[9px] font-mono text-gray-400 max-w-[160px] truncate">{row.resolvedUserId}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${getApiColor(row.api_name)}`}>
                          {row.api_name || 'N/D'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-on-surface-variant max-w-[180px] truncate" title={row.feature_context}>
                        {row.cleanFeature || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs font-black text-on-surface">
                        {(row.tokens_used || 0).toLocaleString('it-IT')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-black ${isFreeCost ? 'text-emerald-600' : 'text-amber-700'}`}>
                          {isFreeCost ? 'GRATIS' : `$${row.computedCost.toFixed(6)}`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setExpandedRow(isExpanded ? null : row.id)}
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-blue-50/20">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                            <div>
                              <div className="text-[10px] font-black text-primary/50 uppercase tracking-wider mb-1">ID Transazione</div>
                              <div className="font-mono text-on-surface break-all">{row.id}</div>
                            </div>
                            <div>
                              <div className="text-[10px] font-black text-primary/50 uppercase tracking-wider mb-1">User ID</div>
                              <div className="font-mono text-on-surface break-all">{row.resolvedUserId || 'Anonimo'}</div>
                            </div>
                            <div>
                              <div className="text-[10px] font-black text-primary/50 uppercase tracking-wider mb-1">Costo Stimato DB</div>
                              <div className="font-mono text-on-surface">{row.cost_estimation != null ? `$${Number(row.cost_estimation).toFixed(8)}` : 'N/D'}</div>
                            </div>
                            <div>
                              <div className="text-[10px] font-black text-primary/50 uppercase tracking-wider mb-1">Costo Calcolato (Frontend)</div>
                              <div className="font-mono font-black text-emerald-700">${row.computedCost.toFixed(8)}</div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between">
            <div className="text-xs text-gray-500 font-medium">
              Pagina {logPage + 1} di {totalPages} · {filteredLogs.length.toLocaleString('it-IT')} risultati
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={logPage === 0}
                onClick={() => setLogPage(p => p - 1)}
                className="px-3 py-1.5 text-xs font-black text-primary border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Precedente
              </button>
              <button
                disabled={logPage >= totalPages - 1}
                onClick={() => setLogPage(p => p + 1)}
                className="px-3 py-1.5 text-xs font-black text-primary border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Successiva →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
