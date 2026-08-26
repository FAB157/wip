import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getApiUrl } from '../lib/api';
import {
  BarChart3, Calendar, Database, Eye, RefreshCw, Users, FileText,
  MapPin, Brain, Headphones, Globe, Activity, TrendingUp, AlertCircle,
  ChevronLeft, ChevronRight, X
} from 'lucide-react';

interface ApiLogGroup {
  apiName: string;
  total: number;
  tokens_used?: number;
  contexts: Record<string, number>;
}

// Tetto di righe caricate dalle due liste di dettaglio. shared_pois ha ~2,4
// milioni di righe: senza limite (e senza paginazione) il browser si piantava
// appena si sceglieva un periodo ampio.
const MAX_RIGHE_LISTA = 500;
const RIGHE_PER_PAGINA = 50;

export default function AdminCounters() {
  const [filterType, setFilterType] = useState<'today' | 'month' | 'custom'>('month');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    // Default: start of current month
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Motivo per cui la telemetria non e' leggibile (tabella assente, RLS, rete).
  // Prima al posto di questo c'era un flag che faceva scattare una serie di
  // numeri demo inventati: in un pannello di controllo un dato falso e' molto
  // peggio di nessun dato, perche' l'admin ci prende decisioni.
  const [logsError, setLogsError] = useState<string | null>(null);

  // Stats States
  const [apiLogs, setApiLogs] = useState<ApiLogGroup[]>([]);
  // null = conteggio non disponibile (errore/permessi), distinto dallo 0 reale.
  const [dbCounts, setDbCounts] = useState<Record<string, number | null>>({
    usersCount: 0,
    itinerariesCount: 0,
    poisCount: 0,
    newPoisCount: 0,
    aiPoisCount: 0,
    audioCacheCount: 0,
    approvedPoisCount: 0,
    draftPoisCount: 0,
    activeUsersCount: 0,
    gemPoisCount: 0
  });
  const [enrichedSample, setEnrichedSample] = useState<any[]>([]);
  const [seededSample, setSeededSample] = useState<any[]>([]);
  // Totale STIMATO delle due liste (count 'planned'): serve solo a dichiarare
  // in chiaro quando quello che si vede e' un troncamento.
  const [enrichedTotal, setEnrichedTotal] = useState<number | null>(null);
  const [seededTotal, setSeededTotal] = useState<number | null>(null);
  const [enrichedPage, setEnrichedPage] = useState(0);
  const [seededPage, setSeededPage] = useState(0);
  // Filtro di stato acceso dalle card contatore cliccabili.
  const [listFilter, setListFilter] = useState<'approvati' | 'draft' | null>(null);
  const enrichedRef = useRef<HTMLDivElement | null>(null);
  const seededRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchStats();
  }, [filterType, startDate, endDate]);

  // Cambiando filtro si riparte da pagina 1, altrimenti si resta su una
  // pagina che nel nuovo insieme filtrato non esiste piu'.
  useEffect(() => {
    setEnrichedPage(0);
    setSeededPage(0);
  }, [listFilter]);

  /** Porta la lista in vista e ci applica il filtro di stato della card. */
  const apriLista = (quale: 'enriched' | 'seeded', filtro: 'approvati' | 'draft' | null) => {
    setListFilter(filtro);
    const target = quale === 'enriched' ? enrichedRef.current : seededRef.current;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const fetchStats = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    setEnrichedPage(0);
    setSeededPage(0);

    // Compute Date Range Boundaries
    let startIso = '';
    let endIso = '';

    const today = new Date();
    if (filterType === 'today') {
      const s = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
      const e = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
      startIso = s.toISOString();
      endIso = e.toISOString();
    } else if (filterType === 'month') {
      const s = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0);
      const e = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
      startIso = s.toISOString();
      endIso = e.toISOString();
    } else {
      if (!startDate || !endDate) return;
      const s = new Date(startDate);
      s.setHours(0, 0, 0, 0);
      const e = new Date(endDate);
      e.setHours(23, 59, 59, 999);
      startIso = s.toISOString();
      endIso = e.toISOString();
    }

    try {
      // Run in parallel but isolate logs fetching to prevent database counter crashes!
      await Promise.all([
        fetchApiUsageLogs(startIso, endIso),
        fetchDatabaseCounters(startIso, endIso),
        fetchEnrichedSample(startIso, endIso),
        fetchSeededSample(startIso, endIso)
      ]);
    } catch (err: any) {
      console.error('Error fetching database counters:', err);
      setErrorMsg('Errore di connessione nel caricamento dei contatori del database.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchApiUsageLogs = async (start: string, end: string) => {
    try {
      let allData: any[] = [];
      let from = 0;
      const step = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('api_usage_logs')
          .select('*')
          .gte('created_at', start)
          .lte('created_at', end)
          .range(from, from + step - 1);

        if (error) {
          console.warn('[Analytics] Telemetry logs table missing or query failed:', error.message);
          // Nessun dato inventato: si azzera la lista e si dichiara il motivo.
          setApiLogs([]);
          setLogsError(error.message || 'errore sconosciuto sulla tabella api_usage_logs');
          return;
        }

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          from += step;
          if (data.length < step) hasMore = false;
        } else {
          hasMore = false;
        }
      }

      const data = allData;

      // 2. Aggregate logs by api_name and feature_context
      const groups: Record<string, { total: number; tokens_used: number; contexts: Record<string, number> }> = {};

      (data || []).forEach((row: any) => {
        const api = row.api_name || 'unknown';
        const ctx = row.feature_context || 'general';

        if (!groups[api]) {
          groups[api] = { total: 0, tokens_used: 0, contexts: {} };
        }

        groups[api].total += 1;
        groups[api].tokens_used += (row.tokens_used || 0);
        groups[api].contexts[ctx] = (groups[api].contexts[ctx] || 0) + 1;
      });

      const aggregated: ApiLogGroup[] = Object.entries(groups).map(([apiName, info]) => ({
        apiName,
        total: info.total,
        tokens_used: info.tokens_used,
        contexts: info.contexts
      })).sort((a, b) => b.total - a.total);

      setApiLogs(aggregated);
      setLogsError(null);
    } catch (err: any) {
      console.warn('[Analytics] fetchApiUsageLogs catch exception:', err);
      setApiLogs([]);
      setLogsError(err?.message || 'eccezione durante la lettura della telemetria');
    }
  };

  const fetchEnrichedSample = async (start: string, end: string) => {
    try {
      // Prima qui c'era .limit(999999) e la lista veniva stampata INTERA:
      // su un periodo ampio significava decine di migliaia di nodi nel DOM.
      // Ora si caricano al massimo MAX_RIGHE_LISTA righe e si impagina.
      // count 'planned' e non 'exact': su shared_pois (~2,4 M righe) un count
      // esatto e' una scansione completa e il 18/08/2026 ha messo in ginocchio
      // Supabase in produzione. Il numero e' una stima e la UI lo dichiara.
      const { data, error, count } = await supabase
        .from('shared_pois')
        .select('name, category, description_ai, description_short, description_long, updated_at, created_at, status', { count: 'planned' })
        .not('description_ai', 'is', null)
        .neq('description_ai', '')
        .gte('updated_at', start)
        .lte('updated_at', end)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(MAX_RIGHE_LISTA);

      if (error) {
        console.warn('[AdminCounters] fetchEnrichedSample error:', error);
        setEnrichedSample([]);
        setEnrichedTotal(null);
        return;
      }
      setEnrichedSample(data || []);
      setEnrichedTotal(typeof count === 'number' ? count : null);
    } catch (err) {
      console.warn('[AdminCounters] fetchEnrichedSample catch:', err);
      setEnrichedSample([]);
      setEnrichedTotal(null);
    }
  };

  const fetchSeededSample = async (start: string, end: string) => {
    try {
      // Stesso trattamento della lista arricchiti: qui mancava del tutto un
      // limite. L'.order('created_at') era anche ripetuto due volte identico.
      const { data, error, count } = await supabase
        .from('shared_pois')
        .select('name, category, created_at, status', { count: 'planned' })
        .or('description_ai.is.null,description_ai.eq.""')
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false })
        .limit(MAX_RIGHE_LISTA);

      if (error) {
        console.warn('[AdminCounters] fetchSeededSample error:', error);
        setSeededSample([]);
        setSeededTotal(null);
        return;
      }
      setSeededSample(data || []);
      setSeededTotal(typeof count === 'number' ? count : null);
    } catch (err) {
      console.warn('[AdminCounters] fetchSeededSample catch:', err);
      setSeededSample([]);
      setSeededTotal(null);
    }
  };

  const fetchDatabaseCounters = async (start: string, end: string) => {
    // Ritorna null (NON 0) quando la query fallisce: un errore RLS/permessi
    // non deve mascherarsi da "0 utenti". La UI mostra "—" per il null.
    //
    // modo: 'exact' conta riga per riga, 'planned' chiede la stima al planner.
    // Su shared_pois (~2,4 MILIONI di righe) l'exact e' VIETATO: obbliga
    // Postgres a una scansione completa e il 18/08/2026 una diagnostica di
    // questo tipo ha abbattuto Supabase in produzione, login compreso. Tutti i
    // conteggi su shared_pois usano quindi 'planned' (numero approssimato, la
    // card lo segnala con "≈"). Sulle tabelle piccole - user_profiles,
    // user_quotas, user_itineraries, api_cache - l'exact resta corretto.
    const fetchCount = async (
      table: string,
      builderModifier?: (query: any) => any,
      modo: 'exact' | 'planned' = 'exact'
    ): Promise<number | null> => {
      try {
        let query = supabase.from(table).select('*', { count: modo, head: true });
        if (builderModifier) {
          query = builderModifier(query);
        }
        // Limite sempre presente: anche in head:true evita che una modifica
        // futura si porti dietro l'intero risultato.
        const res = await query.limit(1);
        if (res.error) throw res.error;
        return res.count || 0;
      } catch (err: any) {
        console.warn(`[AdminCounters] Error fetching count for ${table}:`, err.message || err);
        return null;
      }
    };

    // Tutti i conteggi in PARALLELO: erano ~10 query sequenziali e il tab
    // impiegava diversi secondi ad aprirsi. I due con fallback restano
    // sequenziali solo al loro interno.
    const [
      usersCount,            // registrati (con profilo), totale assoluto
      activeUsersCount,      // con quota aggiornata nel periodo (= hanno usato l'app)
      itinerariesCount,      // user_itineraries, fallback api_cache 'itinerary'
      poisCount,             // shared_pois, totale assoluto
      approvedPoisCount,     // status verified/auto
      gemPoisCount,          // gemme
      draftPoisCount,        // bozze
      newPoisCount,          // creati nel periodo
      aiPoisCount,           // arricchiti AI nel periodo
      audioCacheCount        // audioguide generate, fallback api_cache 'audio_guide'
    ] = await Promise.all([
      fetchCount('user_profiles'),
      fetchCount('user_quotas', (q) => q.gte('updated_at', start).lte('updated_at', end)),
      (async () => {
        let c = await fetchCount('user_itineraries', (q) => q.gte('created_at', start).lte('created_at', end));
        if (!c) { // null (errore) o 0: prova il fallback su api_cache
          c = await fetchCount('api_cache', (q) => q.eq('content_type', 'itinerary').gte('created_at', start).lte('created_at', end));
        }
        return c;
      })(),
      // Tutti i conteggi su shared_pois: 'planned' obbligatorio (vedi sopra).
      fetchCount('shared_pois', undefined, 'planned'),
      fetchCount('shared_pois', (q) => q.in('status', ['verified', 'auto']), 'planned'),
      fetchCount('shared_pois', (q) => q.eq('is_gem', true), 'planned'),
      fetchCount('shared_pois', (q) => q.eq('status', 'draft'), 'planned'),
      fetchCount('shared_pois', (q) => q.gte('created_at', start).lte('created_at', end), 'planned'),
      fetchCount('shared_pois', (q) => q.not('description_ai', 'is', null).gte('updated_at', start).lte('updated_at', end), 'planned'),
      (async () => {
        let c = await fetchCount('shared_poi_audio_cache', (q) =>
          q.not('generated_text', 'is', null).gte('created_at', start).lte('created_at', end));
        if (!c) { // null (errore) o 0: prova il fallback su api_cache
          c = await fetchCount('api_cache', (q) => q.eq('content_type', 'audio_guide').gte('created_at', start).lte('created_at', end));
        }
        return c;
      })()
    ]);

    setDbCounts({
      usersCount,
      activeUsersCount,
      itinerariesCount,
      poisCount,
      newPoisCount,
      aiPoisCount,
      audioCacheCount,
      approvedPoisCount,
      draftPoisCount,
      gemPoisCount
    });
  };

  // Filtro di stato acceso dalle card cliccabili (POI Approvati / POI Bozza).
  const passaFiltro = (stato: string | null | undefined) => {
    if (!listFilter) return true;
    if (listFilter === 'approvati') return stato === 'verified' || stato === 'auto';
    return stato === 'draft';
  };
  const etichettaFiltro = listFilter === 'approvati'
    ? 'solo approvati (verified/auto)'
    : listFilter === 'draft' ? 'solo bozze (draft)' : '';

  const enrichedFiltrati = enrichedSample.filter(p => passaFiltro(p.status));
  const seededFiltrati = seededSample.filter(p => passaFiltro(p.status));
  const enrichedPagina = enrichedFiltrati.slice(enrichedPage * RIGHE_PER_PAGINA, (enrichedPage + 1) * RIGHE_PER_PAGINA);
  const seededPagina = seededFiltrati.slice(seededPage * RIGHE_PER_PAGINA, (seededPage + 1) * RIGHE_PER_PAGINA);

  return (
    <div className="space-y-6 bg-surface rounded-3xl p-2 sm:p-4 animate-in fade-in duration-300">
      {/* Real-time Header & Refresh */}
      <div className="flex items-center justify-between gap-4 border-b border-outline-variant pb-3">
        <h4 className="text-sm font-black text-primary uppercase tracking-wider flex items-center gap-2">
          <BarChart3 className="w-4.5 h-4.5 text-secondary" />
          Statistiche Telemetria & Database in Tempo Reale
        </h4>
        <button
          onClick={fetchStats}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-outline-variant text-primary rounded-xl text-xs font-black transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          {isLoading ? 'Aggiornamento...' : 'Aggiorna'}
        </button>
      </div>
      
      {/* Date Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-surface p-4 rounded-3xl border border-outline-variant">
        <div className="flex flex-wrap items-center gap-1.5">
          <Calendar className="w-4 h-4 text-secondary shrink-0 mr-1.5" />
          {[
            { id: 'today', label: 'Oggi' },
            { id: 'month', label: 'Questo Mese' },
            { id: 'custom', label: 'Periodo Personalizzato' }
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setFilterType(opt.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                filterType === opt.id 
                  ? 'bg-primary text-secondary shadow-md' 
                  : 'bg-surface hover:bg-surface-variant text-primary/75'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {filterType === 'custom' && (
          <div className="flex items-center gap-2 transition-all duration-300">
            <input 
              type="date" 
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="bg-surface border-none rounded-xl px-3 py-2 text-xs font-bold text-primary focus:ring-2 focus:ring-primary/25 shadow-sm"
            />
            <span className="text-xs font-bold text-on-surface-variant/60">a</span>
            <input 
              type="date" 
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="bg-surface border-none rounded-xl px-3 py-2 text-xs font-bold text-primary focus:ring-2 focus:ring-primary/25 shadow-sm"
            />
          </div>
        )}
      </div>

      {logsError && (
        <div className="p-4 bg-red-50 text-red-800 rounded-2xl border border-red-100 flex items-start gap-3 text-xs font-medium transition-all animate-in slide-in-from-top duration-300">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-black mb-1 text-red-950">Telemetria non leggibile</p>
            <p className="opacity-90 leading-relaxed">
              Motivo: <span className="font-bold">{logsError}</span>.
              Nessun consumo API viene mostrato finche' la tabella{' '}
              <code className="bg-red-100/60 px-1 rounded font-bold">api_usage_logs</code> non e' leggibile
              (creala con lo script SQL in fondo a <code className="bg-red-100/60 px-1 rounded font-bold">schema.sql</code> e verifica le policy RLS).
            </p>
            <button
              onClick={fetchStats}
              disabled={isLoading}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-900 rounded-xl text-[11px] font-black uppercase tracking-wider disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              Riprova
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-orange-50 text-orange-800 rounded-2xl border border-orange-100 flex items-start gap-2.5 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold mb-1">Nota del Database</p>
            <p>{errorMsg}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
        <CounterCard 
          icon={<Users className="w-4 h-4 text-blue-600" />} 
          label="Iscritti Totali" 
          value={dbCounts.usersCount} 
          loading={isLoading}
          bg="bg-blue-50/50"
        />
        <CounterCard
          icon={<MapPin className="w-4 h-4 text-indigo-600" />}
          label="POI Totali nel Database"
          value={dbCounts.poisCount}
          loading={isLoading}
          bg="bg-indigo-50/50"
          stima
        />
        <CounterCard
          icon={<Eye className="w-4 h-4 text-teal-600" />}
          label="Nuovi POI (Periodo)"
          value={dbCounts.newPoisCount}
          loading={isLoading}
          bg="bg-teal-50/50"
          stima
          onClick={() => apriLista('seeded', null)}
          hint="Apre la lista dei POI da seeding del periodo"
        />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <CounterCard
          icon={<Globe className="w-4 h-4 text-green-600" />}
          label="POI Approvati ✅"
          value={dbCounts.approvedPoisCount}
          loading={isLoading}
          bg="bg-green-50/50"
          stima
          onClick={() => apriLista('enriched', 'approvati')}
          hint="Filtra la lista arricchiti sui soli approvati (verified/auto)"
        />
        <CounterCard
          icon={<Database className="w-4 h-4 text-orange-500" />}
          label="POI Bozza 🚧"
          value={dbCounts.draftPoisCount}
          loading={isLoading}
          bg="bg-orange-50/50"
          stima
          onClick={() => apriLista('seeded', 'draft')}
          hint="Filtra la lista da seeding sulle sole bozze"
        />
        <CounterCard 
          icon={<Activity className="w-4 h-4 text-rose-500" />} 
          label="Utenti Attivi" 
          value={dbCounts.activeUsersCount} 
          loading={isLoading}
          bg="bg-rose-50/50"
        />
        <CounterCard 
          icon={<FileText className="w-4 h-4 text-emerald-600" />} 
          label="Itinerari Salvati" 
          value={dbCounts.itinerariesCount} 
          loading={isLoading}
          bg="bg-emerald-50/50"
        />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
        <CounterCard
          icon={<AlertCircle className="w-4 h-4 text-amber-500" />}
          label="Gemme Totali ⭐"
          value={dbCounts.gemPoisCount}
          loading={isLoading}
          bg="bg-yellow-50/50"
          stima
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <CounterCard
          icon={<Brain className="w-4 h-4 text-purple-600" />}
          label="POI con Descrizione AI"
          value={dbCounts.aiPoisCount}
          loading={isLoading}
          bg="bg-purple-50/50"
          stima
          onClick={() => apriLista('enriched', null)}
          hint="Apre la lista dei POI arricchiti nel periodo"
        />
        <CounterCard 
          icon={<Headphones className="w-4 h-4 text-amber-600" />} 
          label="Guide Audio Generate" 
          value={dbCounts.audioCacheCount} 
          loading={isLoading}
          bg="bg-amber-50/50"
        />
      </div>

      {/* API Telemetry details */}
      <div className="bg-surface border border-outline-variant rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-outline-variant pb-3">
          <h4 className="font-black text-sm text-primary uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4 text-secondary" />
            Consumo API Esterne (Dettaglio per Funzione)
          </h4>
          <span className="text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
            {isLoading ? 'Aggiornamento...' : 'Pronto'}
          </span>
        </div>

        {apiLogs.length === 0 ? (
          <div className="py-12 text-center text-on-surface-variant opacity-60">
            <Globe className="w-8 h-8 mx-auto mb-3 opacity-30" />
            {logsError ? (
              <>
                <p className="font-bold text-sm">Telemetria non leggibile</p>
                <p className="text-xs mt-1">{logsError}</p>
                <p className="text-xs mt-1">Nessun numero viene mostrato: meglio il vuoto di un dato inventato.</p>
              </>
            ) : (
              <>
                <p className="font-bold text-sm">Nessuna chiamata API registrata</p>
                <p className="text-xs mt-1">Non sono state rilevate chiamate API esterne nel periodo selezionato.</p>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {apiLogs.map((log) => (
              <div 
                key={log.apiName} 
                className="bg-surface rounded-2xl p-4 border border-outline-variant/10 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-black text-xs text-primary bg-orange-50 text-orange-700 px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                      {log.apiName}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-primary">
                        {log.total} chiamate
                      </span>
                      {log.tokens_used !== undefined && log.tokens_used > 0 && (
                        <span className="text-[10px] font-bold text-on-surface-variant bg-surface border border-outline-variant px-1.5 py-0.5 rounded shadow-sm">
                           {log.tokens_used.toLocaleString('it-IT', { timeZone: 'Europe/Rome' })} token
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Sub-list featured context spendings */}
                  <div className="space-y-2 mt-2">
                    {Object.entries(log.contexts).map(([context, count]) => {
                      const percentage = Math.round((Number(count) / log.total) * 100);
                      return (
                        <div key={context} className="text-xs font-medium space-y-1">
                          <div className="flex justify-between text-on-surface-variant/80">
                            <span className="truncate pr-4 opacity-80">{context}</span>
                            <span className="font-bold shrink-0">{count} ({percentage}%)</span>
                          </div>
                          <div className="w-full bg-gray-200/50 rounded-full h-1.5 overflow-hidden">
                            <div 
                              className="h-full bg-primary rounded-full transition-all" 
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Qui arrivano solo righe realmente lette da api_usage_logs:
                    i dati dimostrativi sono stati eliminati, quando la lettura
                    fallisce la lista resta vuota e compare l'avviso rosso. */}
                <div className="mt-4 pt-3 border-t border-outline-variant/40 flex items-center justify-between text-[9px] font-black uppercase tracking-wider text-on-surface-variant/60">
                  <span>TELEMETRIA ATTIVA</span>
                  <span>OK</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI Enriched POIs Sample */}
      <div ref={enrichedRef} className="bg-surface border border-outline-variant rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant pb-3">
          <h4 className="font-black text-sm text-[#8b5cf6] uppercase tracking-wider flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Dettaglio POI Arricchiti di Recente
          </h4>
          {listFilter && (
            <button
              onClick={() => setListFilter(null)}
              className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 px-2 py-1 rounded-full hover:bg-purple-100"
              title="Rimuovi il filtro di stato"
            >
              Filtro: {etichettaFiltro} <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <TroncamentoNota caricate={enrichedSample.length} totale={enrichedTotal} mostrate={enrichedFiltrati.length} filtrata={!!listFilter} />

        {enrichedFiltrati.length === 0 ? (
          <div className="py-12 text-center text-on-surface-variant opacity-60">
            <p className="font-bold text-sm">Nessun POI arricchito di recente</p>
            <p className="text-xs mt-1">
              {listFilter
                ? 'Nessun POI arricchito con questo stato nel periodo selezionato.'
                : 'Non ci sono nuovi arricchimenti AI nel periodo selezionato.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {enrichedPagina.map((poi, idx) => (
              <div key={idx} className="p-4 bg-surface-variant rounded-2xl border border-outline-variant space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black bg-purple-100 text-purple-700 px-2 py-0.5 rounded-md uppercase">
                      {poi.category}
                    </span>
                    <span className="font-bold text-sm text-primary">{poi.name}</span>
                  </div>
                  <span className="text-[10px] font-bold text-on-surface-variant">
                    {poi.updated_at ? new Date(poi.updated_at).toLocaleString('it-IT', { timeZone: 'Europe/Rome' }) : new Date(poi.created_at).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant line-clamp-2">
                  {poi.description_ai || poi.description_short || poi.description_long || "In elaborazione..."}
                </p>
              </div>
            ))}
            <Paginatore
              pagina={enrichedPage}
              totaleRighe={enrichedFiltrati.length}
              onCambia={setEnrichedPage}
            />
          </div>
        )}
      </div>

      {/* Seeded POIs Sample */}
      <div ref={seededRef} className="bg-surface border border-outline-variant rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant pb-3">
          <h4 className="font-black text-sm text-amber-600 uppercase tracking-wider flex items-center gap-2">
            <Database className="w-5 h-5" />
            Dettaglio POI da Seeding
          </h4>
          {listFilter && (
            <button
              onClick={() => setListFilter(null)}
              className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 px-2 py-1 rounded-full hover:bg-amber-100"
              title="Rimuovi il filtro di stato"
            >
              Filtro: {etichettaFiltro} <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <TroncamentoNota caricate={seededSample.length} totale={seededTotal} mostrate={seededFiltrati.length} filtrata={!!listFilter} />

        {seededFiltrati.length === 0 ? (
          <div className="py-12 text-center text-on-surface-variant opacity-60">
            <p className="font-bold text-sm">Nessun POI grezzo inserito di recente</p>
            <p className="text-xs mt-1">
              {listFilter
                ? 'Nessun POI grezzo con questo stato nel periodo selezionato.'
                : "L'area non ha ricevuto seeding nel periodo selezionato."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {seededPagina.map((poi, idx) => (
              <div key={idx} className="p-4 bg-surface-variant rounded-2xl border border-outline-variant space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md uppercase">
                      {poi.category}
                    </span>
                    <span className="font-bold text-sm text-primary">{poi.name}</span>
                  </div>
                  <span className="text-[10px] font-bold text-on-surface-variant">
                    {new Date(poi.created_at).toLocaleString('it-IT')}
                  </span>
                </div>
                <p className="text-xs text-amber-600 font-medium">In attesa di arricchimento AI</p>
              </div>
            ))}
            <Paginatore
              pagina={seededPage}
              totaleRighe={seededFiltrati.length}
              onCambia={setSeededPage}
            />
          </div>
        )}
      </div>

      {/* Export contabile: CSV delle transazioni crediti (Excel italiano) */}
      <ExportContabileSection />

    </div>
  );
}

// ── EXPORT CONTABILE ────────────────────────────────────────────────
// Scarica il CSV di credit_transactions dal server (rotta admin protetta):
// BOM UTF-8 e separatore ';' per aprirlo direttamente in Excel italiano.
// Default: il mese scorso. Range massimo 90 giorni (limite lato server).
function ExportContabileSection() {
  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().split('T')[0];
  });
  const [to, setTo] = useState<string>(() => {
    const d = new Date();
    // Ultimo giorno del mese scorso
    return new Date(d.getFullYear(), d.getMonth(), 0).toISOString().split('T')[0];
  });
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const download = async () => {
    setDownloading(true);
    setError('');
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      if (!token) throw new Error('Sessione admin scaduta: rifai il login.');
      const res = await fetch(
        getApiUrl(`/api/admin/export/transactions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { msg = (await res.json())?.error || msg; } catch { /* corpo non JSON */ }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transazioni_${from}_${to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e: any) {
      setError(e?.message || 'Download fallito');
    }
    setDownloading(false);
  };

  return (
    <div className="bg-surface border border-outline-variant rounded-3xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-outline-variant pb-3">
        <h4 className="font-black text-sm text-primary uppercase tracking-wider flex items-center gap-2">
          <FileText className="w-5 h-5 text-secondary" />
          🧾 Export contabile (transazioni crediti)
        </h4>
      </div>
      <p className="text-xs text-on-surface-variant">
        CSV di tutte le transazioni crediti (acquisti, consumi, rimborsi, rettifiche admin) nel periodo scelto,
        con email utente dove disponibile. Formato Excel italiano (separatore ';'). Range massimo: 90 giorni.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={from}
          onChange={e => setFrom(e.target.value)}
          className="bg-surface border border-outline-variant rounded-xl px-3 py-2 text-xs font-bold text-primary focus:ring-2 focus:ring-primary/25 shadow-sm"
        />
        <span className="text-xs font-bold text-on-surface-variant/60">a</span>
        <input
          type="date"
          value={to}
          onChange={e => setTo(e.target.value)}
          className="bg-surface border border-outline-variant rounded-xl px-3 py-2 text-xs font-bold text-primary focus:ring-2 focus:ring-primary/25 shadow-sm"
        />
        <button
          onClick={download}
          disabled={downloading || !from || !to}
          className="px-4 py-2 rounded-xl bg-primary text-secondary text-xs font-black uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
        >
          {downloading
            ? (<><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Preparazione...</>)
            : (<>💾 Scarica CSV</>)}
        </button>
      </div>
      {error && <div className="text-[11px] font-bold text-red-600">{error}</div>}
    </div>
  );
}

// ── NOTA DI TRONCAMENTO ─────────────────────────────────────────────
// Dichiara apertamente quante righe si stanno vedendo rispetto a quante ne
// esistono: una lista tagliata senza avviso fa credere all'admin che il resto
// non esista. Il totale e' una STIMA (count 'planned' su shared_pois).
function TroncamentoNota({
  caricate,
  totale,
  mostrate,
  filtrata
}: {
  caricate: number;
  totale: number | null;
  mostrate: number;
  filtrata: boolean;
}) {
  if (caricate === 0) return null;
  const troncata = caricate >= MAX_RIGHE_LISTA;
  return (
    <div className="text-[11px] font-bold text-on-surface-variant/70 bg-surface-variant/60 rounded-xl px-3 py-2">
      {troncata ? (
        <>
          Mostrate le prime {MAX_RIGHE_LISTA.toLocaleString('it-IT')} righe
          {typeof totale === 'number' && totale > caricate
            ? <> di circa {totale.toLocaleString('it-IT')} (stima del database)</>
            : <> del periodo</>}: la lista e' troncata per non bloccare il browser.
          Restringi il periodo per vedere il resto.
        </>
      ) : (
        <>Caricate {caricate.toLocaleString('it-IT')} righe del periodo (nessun troncamento).</>
      )}
      {filtrata && <> Filtro di stato attivo: {mostrate.toLocaleString('it-IT')} righe corrispondenti.</>}
    </div>
  );
}

// ── PAGINATORE CLIENT ───────────────────────────────────────────────
// 50 righe per pagina: prima le liste venivano stampate per intero.
function Paginatore({
  pagina,
  totaleRighe,
  onCambia
}: {
  pagina: number;
  totaleRighe: number;
  onCambia: (p: number) => void;
}) {
  const pagine = Math.ceil(totaleRighe / RIGHE_PER_PAGINA);
  if (pagine <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-2">
      <button
        onClick={() => onCambia(Math.max(0, pagina - 1))}
        disabled={pagina === 0}
        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-surface-variant text-[11px] font-black uppercase tracking-wider text-primary disabled:opacity-40"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Precedenti
      </button>
      <span className="text-[11px] font-bold text-on-surface-variant/70">
        Pagina {pagina + 1} di {pagine}
      </span>
      <button
        onClick={() => onCambia(Math.min(pagine - 1, pagina + 1))}
        disabled={pagina >= pagine - 1}
        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-surface-variant text-[11px] font-black uppercase tracking-wider text-primary disabled:opacity-40"
      >
        Successivi <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function CounterCard({
  icon,
  label,
  value,
  loading = false,
  bg = "bg-surface-variant/50",
  stima = false,
  onClick,
  hint
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  loading?: boolean;
  bg?: string;
  /** true = numero da count 'planned' (stima del planner), si mostra con "≈". */
  stima?: boolean;
  /** Se presente la card diventa cliccabile e porta alla lista corrispondente. */
  onClick?: () => void;
  hint?: string;
}) {
  const contenuto = (
    <>
      <div className="flex items-center justify-between">
        <div className="w-7 h-7 rounded-xl bg-surface flex items-center justify-center shadow-sm">
          {icon}
        </div>
        <TrendingUp className="w-3.5 h-3.5 text-on-surface-variant/30" />
      </div>
      <div className="mt-3">
        <p className="text-[10px] font-black text-on-surface-variant/60 uppercase tracking-wider truncate">
          {label}
        </p>
        <p className="text-xl font-black text-primary mt-0.5">
          {loading ? (
            <span className="inline-block animate-pulse opacity-40">...</span>
          ) : value === null ? (
            // Conteggio non disponibile (errore/permessi): "—", non uno 0 finto.
            <span className="text-on-surface-variant/50" title="Conteggio non disponibile (errore o permessi)">—</span>
          ) : (
            <span title={stima ? 'Stima del database: su shared_pois (~2,4 milioni di righe) il conteggio esatto e\' proibito' : undefined}>
              {stima && <span className="text-on-surface-variant/50">≈ </span>}
              {value.toLocaleString('it-IT')}
            </span>
          )}
        </p>
        {onClick && (
          <p className="text-[9px] font-black uppercase tracking-wider text-primary/60 mt-1">Vedi lista ↓</p>
        )}
      </div>
    </>
  );

  const classi = `p-4 rounded-2xl border border-outline-variant/10 shadow-sm ${bg} flex flex-col justify-between min-h-[100px]`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={hint} className={`${classi} text-left hover:shadow-md hover:border-primary/30 transition-all cursor-pointer w-full`}>
        {contenuto}
      </button>
    );
  }

  return <div className={classi}>{contenuto}</div>;
}

