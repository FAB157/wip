import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  Ticket, RefreshCw, TrendingUp, MapPin, Layers, Download, Search, X,
  BarChart3, Globe, AlertTriangle, Calendar as CalendarIcon
} from 'lucide-react';

type TimeFilter = 'oggi' | 'ieri' | 'settimana' | 'mese' | 'tutto';

type Provider = 'viator' | 'gyg' | 'tiqets' | 'ticketmaster' | 'other';

interface ClickRow {
  id: string;
  created_at: string;
  poi_name: string;
  poi_city: string;
  source_page: string;
  provider: Provider;
}

// Stessa palette usata per le chip/brand nel resto dell'app (CategoryChips,
// PlanScreen): tenerla coerente aiuta a riconoscere il provider a colpo d'occhio.
const PROVIDER_META: Record<Provider, { label: string; color: string; bg: string; border: string }> = {
  viator: { label: 'Viator', color: '#FF5100', bg: 'bg-orange-50', border: 'border-orange-200' },
  gyg: { label: 'GetYourGuide', color: '#0071eb', bg: 'bg-blue-50', border: 'border-blue-200' },
  tiqets: { label: 'Tiqets', color: '#7c3aed', bg: 'bg-violet-50', border: 'border-violet-200' },
  ticketmaster: { label: 'Ticketmaster', color: '#1e3a8a', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  other: { label: 'Altro', color: '#6b7280', bg: 'bg-gray-50', border: 'border-gray-200' },
};
const PROVIDER_ORDER: Provider[] = ['viator', 'gyg', 'tiqets', 'ticketmaster', 'other'];

/**
 * Il DB live potrebbe non avere ancora la colonna `provider` (migrazione
 * 20260807120000). trackAffiliateClick() codifica comunque il provider anche
 * nel prefisso di source_page ("viator:home_chip") proprio per questo: si
 * usa la colonna se c'è, altrimenti si fa il parse del prefisso.
 */
function resolveProvider(row: any): { provider: Provider; page: string } {
  const known = new Set<Provider>(['viator', 'gyg', 'tiqets', 'ticketmaster']);
  const rawProvider = (row.provider || '').toLowerCase();
  if (known.has(rawProvider as Provider)) {
    const page = String(row.source_page || '').replace(new RegExp(`^${rawProvider}:`), '') || row.source_page || '—';
    return { provider: rawProvider as Provider, page };
  }
  const src = String(row.source_page || '');
  const m = src.match(/^(viator|gyg|tiqets|ticketmaster):(.*)$/i);
  if (m) return { provider: m[1].toLowerCase() as Provider, page: m[2] || '—' };
  return { provider: 'other', page: src || '—' };
}

export default function AdminAffiliateStats() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('mese');
  const [rows, setRows] = useState<ClickRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [columnWarning, setColumnWarning] = useState(false);

  const [providerFilter, setProviderFilter] = useState<Provider | ''>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const fetchClicks = async () => {
    setLoading(true);
    setError(null);
    setColumnWarning(false);
    setPage(0);
    try {
      const now = new Date();
      let startIso: string | null = null;
      if (timeFilter === 'oggi') {
        startIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      } else if (timeFilter === 'ieri') {
        startIso = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
      } else if (timeFilter === 'settimana') {
        startIso = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
      } else if (timeFilter === 'mese') {
        startIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      }
      const endIso = timeFilter === 'ieri'
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
        : null;

      let selectCols = 'id, poi_name, poi_city, source_page, created_at, provider';
      let all: any[] = [];
      let from = 0;
      const step = 1000;
      let hasMore = true;
      while (hasMore) {
        let query = supabase.from('affiliate_clicks').select(selectCols);
        if (startIso) query = query.gte('created_at', startIso);
        if (endIso) query = query.lt('created_at', endIso);
        query = query.order('created_at', { ascending: false }).range(from, from + step - 1);
        const { data, error: sbError } = await query;
        if (sbError) {
          if (selectCols.includes('provider') && (sbError.code === '42703' || sbError.message?.includes('does not exist'))) {
            selectCols = 'id, poi_name, poi_city, source_page, created_at';
            setColumnWarning(true);
            continue;
          }
          throw sbError;
        }
        if (data && data.length > 0) {
          all = [...all, ...data];
          from += step;
          if (data.length < step) hasMore = false;
        } else {
          hasMore = false;
        }
      }

      const enriched: ClickRow[] = all.map((row: any) => {
        const { provider, page: sourcePage } = resolveProvider(row);
        return {
          id: row.id,
          created_at: row.created_at,
          poi_name: row.poi_name || 'Sconosciuto',
          poi_city: row.poi_city || '',
          source_page: sourcePage,
          provider,
        };
      });
      setRows(enriched);
    } catch (e: any) {
      setError(e.message || 'Errore nel caricamento delle statistiche affiliazione.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchClicks(); }, [timeFilter]);

  // ── Aggregazioni ──────────────────────────────────────────────────────
  const total = rows.length;

  const byProvider: Record<Provider, number> = { viator: 0, gyg: 0, tiqets: 0, ticketmaster: 0, other: 0 };
  rows.forEach(r => { byProvider[r.provider] = (byProvider[r.provider] || 0) + 1; });

  const pageGroups: Record<string, { count: number; providers: Set<Provider> }> = {};
  rows.forEach(r => {
    const key = r.source_page || '—';
    if (!pageGroups[key]) pageGroups[key] = { count: 0, providers: new Set() };
    pageGroups[key].count += 1;
    pageGroups[key].providers.add(r.provider);
  });
  const topPages = Object.entries(pageGroups)
    .map(([page, v]) => ({ page, count: v.count, providers: [...v.providers] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const poiGroups: Record<string, { count: number; provider: Provider; city: string }> = {};
  rows.forEach(r => {
    const key = r.poi_name;
    if (!poiGroups[key]) poiGroups[key] = { count: 0, provider: r.provider, city: r.poi_city };
    poiGroups[key].count += 1;
  });
  const topPois = Object.entries(poiGroups)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const cityGroups: Record<string, number> = {};
  rows.forEach(r => {
    const key = r.poi_city || 'Zona non nota';
    cityGroups[key] = (cityGroups[key] || 0) + 1;
  });
  const topCities = Object.entries(cityGroups)
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const dayGroups: Record<string, number> = {};
  rows.forEach(r => {
    const d = new Date(r.created_at);
    const key = d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
    dayGroups[key] = (dayGroups[key] || 0) + 1;
  });
  const trend = Object.entries(dayGroups)
    .map(([day, count]) => ({ day, count }))
    .slice(-21); // ultimi 21 giorni compatibili col periodo scelto
  const maxDay = Math.max(1, ...trend.map(t => t.count));

  const topProvider = PROVIDER_ORDER.reduce((best, p) => (byProvider[p] > (byProvider[best] || 0) ? p : best), 'viator' as Provider);

  // ── Log dettagliato filtrato ─────────────────────────────────────────
  const filtered = rows.filter(r => {
    const matchProvider = !providerFilter || r.provider === providerFilter;
    const q = search.trim().toLowerCase();
    const matchSearch = !q || r.poi_name.toLowerCase().includes(q) || r.poi_city.toLowerCase().includes(q) || r.source_page.toLowerCase().includes(q);
    return matchProvider && matchSearch;
  });
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  function exportCSV() {
    const header = 'Data,Ora,Provider,Attrazione/POI,Città,Pagina';
    const csvRows = filtered.map(r => {
      const d = new Date(r.created_at);
      return `${d.toLocaleDateString('it-IT')},${d.toLocaleTimeString('it-IT')},${PROVIDER_META[r.provider].label},"${r.poi_name}","${r.poi_city}","${r.source_page}"`;
    });
    const blob = new Blob([header + '\n' + csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `affiliate_clicks_${timeFilter}.csv`; a.click();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <Ticket className="w-6 h-6 text-violet-500" />
            Statistiche Affiliazione
          </h2>
          <p className="text-on-surface-variant mt-1 text-sm">
            Click in uscita verso Viator, GetYourGuide e Tiqets — da chip mappa, itinerari e schede POI.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-surface border border-outline-variant rounded-xl p-1 shadow-sm">
            {(['oggi', 'ieri', 'settimana', 'mese', 'tutto'] as TimeFilter[]).map(f => (
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
          <button onClick={fetchClicks} disabled={loading} className="p-2.5 bg-surface border border-outline-variant rounded-xl hover:bg-surface-variant transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-primary' : 'text-on-surface-variant'}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm font-medium text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      {columnWarning && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-medium text-amber-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Colonna "provider" assente su affiliate_clicks (migrazione 20260807120000 non applicata): il provider viene dedotto dal prefisso di source_page, dato comunque completo ma un po' più lento da calcolare.
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-violet-50 to-violet-100/40 border border-violet-200/60 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-violet-500" />
            <span className="text-xs font-black uppercase tracking-widest text-violet-600">Click Totali</span>
          </div>
          <div className="text-3xl font-black text-violet-800">{total.toLocaleString('it-IT')}</div>
          <div className="text-[11px] text-violet-500 mt-1">{Object.keys(poiGroups).length} attrazioni distinte</div>
        </div>
        <div className="rounded-2xl p-5 border" style={{ background: `${PROVIDER_META[topProvider].color}0d`, borderColor: `${PROVIDER_META[topProvider].color}40` }}>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4" style={{ color: PROVIDER_META[topProvider].color }} />
            <span className="text-xs font-black uppercase tracking-widest" style={{ color: PROVIDER_META[topProvider].color }}>Provider Leader</span>
          </div>
          <div className="text-2xl font-black" style={{ color: PROVIDER_META[topProvider].color }}>{PROVIDER_META[topProvider].label}</div>
          <div className="text-[11px] mt-1" style={{ color: PROVIDER_META[topProvider].color }}>
            {total > 0 ? `${((byProvider[topProvider] / total) * 100).toFixed(0)}% dei click` : '—'}
          </div>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/40 border border-emerald-200/60 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-black uppercase tracking-widest text-emerald-600">Pagina Top</span>
          </div>
          <div className="text-lg font-black text-emerald-800 truncate">{topPages[0]?.page || '—'}</div>
          <div className="text-[11px] text-emerald-500 mt-1">{topPages[0]?.count || 0} click da qui</div>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100/40 border border-amber-200/60 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-black uppercase tracking-widest text-amber-600">Città Top</span>
          </div>
          <div className="text-lg font-black text-amber-800 truncate">{topCities[0]?.city || '—'}</div>
          <div className="text-[11px] text-amber-500 mt-1">{topCities[0]?.count || 0} click</div>
        </div>
      </div>

      {/* Breakdown per provider */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-4 h-4 text-primary" />
          <h3 className="font-black text-sm text-primary uppercase tracking-wider">Ripartizione per Provider</h3>
        </div>
        {total === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">Nessun click registrato nel periodo selezionato.</p>
        ) : (
          <div className="space-y-3">
            {PROVIDER_ORDER.filter(p => byProvider[p] > 0 || p !== 'other').map(p => {
              const count = byProvider[p];
              const pct = total > 0 ? (count / total) * 100 : 0;
              const meta = PROVIDER_META[p];
              return (
                <div key={p} className="flex items-center gap-3">
                  <span className={`w-32 shrink-0 text-xs font-black px-2 py-1 rounded-lg text-center ${meta.bg} ${meta.border} border`} style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                  <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: meta.color }} />
                  </div>
                  <span className="w-20 text-right text-xs font-black text-on-surface">{count.toLocaleString('it-IT')}</span>
                  <span className="w-14 text-right text-[11px] font-bold text-gray-500">{pct.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top attrazioni */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-black text-sm text-primary uppercase tracking-wider mb-3">Top Attrazioni Cliccate</h3>
          {topPois.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">Nessun dato.</p>
          ) : (
            <div className="space-y-2">
              {topPois.map((item, idx) => (
                <div key={item.name} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xs font-black text-gray-500 w-4 shrink-0">{idx + 1}.</span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-on-surface truncate">{item.name}</div>
                      {item.city && <div className="text-[10px] text-gray-500 truncate">{item.city}</div>}
                    </div>
                  </div>
                  <span
                    className="text-[10px] font-black px-2 py-1 rounded-md shrink-0"
                    style={{ color: PROVIDER_META[item.provider].color, background: `${PROVIDER_META[item.provider].color}1a` }}
                  >
                    {item.count} click
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagine / superfici sorgente */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-black text-sm text-primary uppercase tracking-wider mb-3">Click per Superficie App</h3>
          {topPages.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">Nessun dato.</p>
          ) : (
            <div className="space-y-2">
              {topPages.map(item => (
                <div key={item.page} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                  <span className="text-xs font-bold text-on-surface truncate">{item.page}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.providers.map(p => (
                      <span key={p} className="w-2 h-2 rounded-full" style={{ background: PROVIDER_META[p].color }} title={PROVIDER_META[p].label} />
                    ))}
                    <span className="text-[10px] font-black text-on-surface-variant ml-1">{item.count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Trend giornaliero */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <CalendarIcon className="w-4 h-4 text-primary" />
          <h3 className="font-black text-sm text-primary uppercase tracking-wider">Andamento Giornaliero</h3>
        </div>
        {trend.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">Nessun dato per il periodo selezionato.</p>
        ) : (
          <div className="flex items-end gap-1.5 h-32 overflow-x-auto pb-1">
            {trend.map(t => (
              <div key={t.day} className="flex flex-col items-center gap-1 shrink-0 w-8" title={`${t.day}: ${t.count} click`}>
                <div
                  className="w-full bg-primary/70 rounded-t-md transition-all"
                  style={{ height: `${Math.max(4, (t.count / maxDay) * 96)}px` }}
                />
                <span className="text-[9px] font-bold text-gray-500 rotate-0">{t.day}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Log dettagliato */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h3 className="font-black text-sm text-primary uppercase tracking-wider">Log Click Dettagliati</h3>
              <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-[10px] font-black">
                {filtered.length.toLocaleString('it-IT')} righe
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cerca attrazione / città / pagina..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0); }}
                  className="pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20 w-56"
                />
                {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X className="w-3 h-3 text-gray-400" /></button>}
              </div>
              <select
                value={providerFilter}
                onChange={e => { setProviderFilter(e.target.value as Provider | ''); setPage(0); }}
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20 appearance-none"
              >
                <option value="">Tutti i provider</option>
                {PROVIDER_ORDER.map(p => <option key={p} value={p}>{PROVIDER_META[p].label}</option>)}
              </select>
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
                {['Data & Ora', 'Provider', 'Attrazione / POI', 'Città', 'Pagina'].map(h => (
                  <th key={h} className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-primary/60 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center text-sm text-gray-500">Caricamento...</td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-sm text-gray-500">Nessun click trovato.</td></tr>
              ) : paged.map(row => {
                const d = new Date(row.created_at);
                const meta = PROVIDER_META[row.provider];
                return (
                  <tr key={row.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-xs font-bold text-on-surface">{d.toLocaleDateString('it-IT')}</div>
                      <div className="text-[10px] text-gray-500 font-mono">{d.toLocaleTimeString('it-IT')}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black" style={{ color: meta.color, background: `${meta.color}1a` }}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-on-surface max-w-[220px] truncate" title={row.poi_name}>{row.poi_name}</td>
                    <td className="px-4 py-3 text-xs text-on-surface-variant max-w-[140px] truncate">{row.poi_city || '—'}</td>
                    <td className="px-4 py-3 text-xs text-on-surface-variant max-w-[160px] truncate" title={row.source_page}>{row.source_page}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between">
            <div className="text-xs text-gray-500 font-medium">
              Pagina {page + 1} di {totalPages} · {filtered.length.toLocaleString('it-IT')} risultati
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-xs font-black text-primary border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Precedente
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
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
