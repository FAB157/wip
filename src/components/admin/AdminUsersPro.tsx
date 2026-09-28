import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getApiUrl } from '../../lib/api';
import { notify } from '../../lib/toast';
import { notifyCreditsChanged } from '../../lib/pricing';
import {
  Users, Search, RefreshCw, Download, ChevronLeft, ChevronRight, Loader2,
  AlertTriangle, ShieldCheck, ShieldOff, Wallet, Gauge, Activity, X,
  ArrowUpCircle, ArrowDownCircle, Ban, Crown, Zap, DollarSign, Server,
  Inbox, UserCog, Trophy, Coins, CalendarClock,
} from 'lucide-react';

/**
 * Gestione utenti "pro": elenco paginato lato server, scheda utente con
 * consumo reale (chiamate/token/costo) e tutte le azioni di supporto.
 *
 * Sostituisce la tab "users" inline di AdminPanel, che leggeva 500 profili in
 * un colpo solo e li filtrava nel browser: con qualche migliaio di iscritti
 * quella pagina diventava un download inutile ad ogni apertura del pannello.
 *
 * Sulle rotte: alcune vivono da tempo (credit-adjust, ban, status, set-admin,
 * export CSV) e hanno un contratto storico in camelCase; altre sono nuove e
 * usano snake_case. Finche' la produzione non e' allineata (il nativo punta
 * sempre a wip.guide, quindi il vecchio server resta in piedi per giorni)
 * mandiamo ENTRAMBE le forme nel corpo e in query: i campi di troppo vengono
 * ignorati da qualsiasi versione del server, e nulla si rompe.
 */

const PAGE_SIZE = 50;

type SortKey = 'created_at' | 'credits' | 'email';

interface AdminUserRow {
  id: string;
  email?: string | null;
  display_name?: string | null;
  is_admin?: boolean;
  subscription_tier?: string | null;
  purchased_credits?: number | null;
  earned_credits?: number | null;
  total_credits?: number | null;
  xp_points?: number | null;
  created_at?: string | null;
  /* Presenti solo nel ripiego Supabase e nel profilo di dettaglio */
  is_forever_premium?: boolean | null;
  premium_until?: string | null;
  custom_limit_itinerary?: number | null;
  custom_limit_audio_guide?: number | null;
}

interface UsageBucket {
  name?: string | null;
  calls?: number | null;
  tokens?: number | null;
  cost?: number | null;
}

interface UsageResponse {
  profile?: AdminUserRow | null;
  quota?: Record<string, unknown> | null;
  usage?: {
    calls?: number | null;
    tokens?: number | null;
    cost?: number | null;
    by_api?: UsageBucket[] | null;
    by_feature?: UsageBucket[] | null;
  } | null;
  transactions?: any[] | null;
  itineraries_count?: number | null;
}

interface AuthStatus {
  email?: string | null;
  banned?: boolean;
  banned_until?: string | null;
  last_sign_in_at?: string | null;
  created_at?: string | null;
}

/* ── Fetch admin ─────────────────────────────────────────────────────────── */

const ROUTE_MISSING = '__ROUTE_MISSING__';

const adminAuthHeaders = async (): Promise<Record<string, string>> => {
  const { data: s } = await supabase.auth.getSession();
  const token = s?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Wrapper delle chiamate admin. Il 404 non e' un errore da sbattere in faccia
 * all'operatore: significa "rotta non ancora pubblicata", e va distinto per
 * poter attivare il ripiego. In dev il middleware Vite risponde alla rotta
 * sconosciuta con l'index.html della SPA (200 text/html), quindi vale come
 * rotta mancante anche una risposta non-JSON.
 */
async function adminApi<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(getApiUrl(path), {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(await adminAuthHeaders()),
      ...((init?.headers as Record<string, string>) || {}),
    },
  });
  if (res.status === 404) throw new Error(ROUTE_MISSING);
  const ctype = res.headers.get('content-type') || '';
  if (!ctype.includes('json')) {
    if (res.ok) throw new Error(ROUTE_MISSING);
    throw new Error(`HTTP ${res.status}`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as any)?.error || `HTTP ${res.status}`);
  return data as T;
}

const isRouteMissing = (e: unknown): boolean => String((e as any)?.message || '') === ROUTE_MISSING;
const errText = (e: unknown): string => String((e as any)?.message || e || 'errore sconosciuto');

/* ── Formattazione ───────────────────────────────────────────────────────── */

const nf = (n: unknown): string => (Number(n) || 0).toLocaleString('it-IT');
const money = (n: unknown): string => {
  const v = Number(n) || 0;
  return `$${v >= 1 ? v.toFixed(2) : v.toFixed(4)}`;
};
const dateIt = (s?: string | null): string =>
  s ? new Date(s).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const dateTimeIt = (s?: string | null): string =>
  s ? new Date(s).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const totalCredits = (u: AdminUserRow): number =>
  u.total_credits != null ? Number(u.total_credits) || 0 : (Number(u.purchased_credits) || 0) + (Number(u.earned_credits) || 0);

/**
 * Le colonne di user_quotas cambiano nel tempo (itinerari, audioguide, vision…):
 * invece di elencarle a mano si accoppia ogni `*_used` col suo `*_limit`, cosi'
 * una colonna nuova compare da sola senza toccare questo file.
 */
const QUOTA_LABELS: Record<string, string> = {
  itinerari: 'Itinerari',
  itineraries: 'Itinerari',
  audioguide: 'Audioguide',
  audio_guides: 'Audioguide',
  poi_details: 'Schede POI',
  photo_searches: 'Ricerche foto',
  premium_guides: 'Guide premium',
  vision: 'Scansioni Vision',
};

interface QuotaPair { key: string; label: string; used: number; limit: number | null }

function quotaPairs(quota?: Record<string, unknown> | null): QuotaPair[] {
  if (!quota) return [];
  return Object.keys(quota)
    .filter(k => k.endsWith('_used'))
    .map(k => {
      const base = k.slice(0, -'_used'.length);
      const rawLimit = Number((quota as any)[`${base}_limit`]);
      return {
        key: base,
        label: QUOTA_LABELS[base] || base.replace(/_/g, ' '),
        used: Number((quota as any)[k]) || 0,
        limit: Number.isFinite(rawLimit) ? rawLimit : null,
      };
    })
    .filter(p => p.limit !== null || p.used > 0);
}

/* ── Pezzi di UI riutilizzati ────────────────────────────────────────────── */

function Kpi({ icon, label, value, hint, tone }: {
  icon: React.ReactNode; label: string; value: string; hint?: string;
  tone: 'blue' | 'emerald' | 'purple' | 'amber';
}) {
  const tones: Record<string, string> = {
    blue: 'from-blue-50 to-blue-100/40 border-blue-200/60 text-blue-600',
    emerald: 'from-emerald-50 to-emerald-100/40 border-emerald-200/60 text-emerald-600',
    purple: 'from-purple-50 to-purple-100/40 border-purple-200/60 text-purple-600',
    amber: 'from-amber-50 to-amber-100/40 border-amber-200/60 text-amber-600',
  };
  return (
    <div className={`bg-gradient-to-br border rounded-2xl p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-2xl font-black text-on-surface tabular-nums">{value}</div>
      {hint && <div className="text-[10px] font-bold opacity-70 mt-0.5">{hint}</div>}
    </div>
  );
}

function Section({ title, icon, right, children }: {
  title: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-outline-variant rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[11px] font-black uppercase tracking-widest text-primary/70 flex items-center gap-1.5">
          {icon}{title}
        </h4>
        {right}
      </div>
      {children}
    </div>
  );
}

/* ── Elenco ──────────────────────────────────────────────────────────────── */

export default function AdminUsersPro() {
  const [rawQuery, setRawQuery] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('created_at');
  const [page, setPage] = useState(0);

  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /* Vero quando l'elenco arriva da Supabase perche' /api/admin/users manca */
  const [degraded, setDegraded] = useState(false);

  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  // Debounce della ricerca: senza, ogni tasto è una query paginata sul server.
  useEffect(() => {
    const t = setTimeout(() => { setQuery(rawQuery.trim()); setPage(0); }, 400);
    return () => clearTimeout(t);
  }, [rawQuery]);

  /** Ripiego: lettura diretta di user_profiles (le policy admin la consentono). */
  const loadFromSupabase = useCallback(async () => {
    const column = sort === 'credits' ? 'purchased_credits' : sort === 'email' ? 'email' : 'created_at';
    const from = page * PAGE_SIZE;
    // I caratteri di PostgREST (virgole e parentesi) spezzerebbero la or()
    const term = query.replace(/[,()%*]/g, ' ').trim();

    const run = async (withName: boolean) => {
      // I filtri vanno prima di order/range: dopo, il builder non li accetta più
      let q = supabase.from('user_profiles').select('*', { count: 'exact' });
      if (term) {
        q = withName
          ? q.or(`email.ilike.%${term}%,display_name.ilike.%${term}%`)
          : q.ilike('email', `%${term}%`);
      }
      return q.order(column, { ascending: sort === 'email' }).range(from, from + PAGE_SIZE - 1);
    };

    let res = await run(true);
    // display_name puo' non esistere su questo schema: si ripiega sulla sola email
    if (res.error) res = await run(false);
    if (res.error) throw res.error;
    setRows((res.data as AdminUserRow[]) || []);
    setTotal(Number(res.count) || 0);
    setDegraded(true);
  }, [query, sort, page]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminApi<{ users?: AdminUserRow[]; total?: number }>(
        `/api/admin/users?q=${encodeURIComponent(query)}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}&sort=${sort}`
      );
      setRows(Array.isArray(data?.users) ? data.users : []);
      setTotal(Number(data?.total) || 0);
      setDegraded(false);
    } catch (e) {
      if (isRouteMissing(e)) {
        try {
          await loadFromSupabase();
        } catch (e2) {
          setError(`Elenco non disponibile: la rotta /api/admin/users non è pubblicata e la lettura diretta è fallita (${errText(e2)}).`);
          setRows([]);
          setTotal(0);
        }
      } else {
        setError(errText(e));
        setRows([]);
      }
    } finally {
      setLoading(false);
    }
  }, [query, sort, page, loadFromSupabase]);

  useEffect(() => { load(); }, [load]);

  const pages = total > 0 ? Math.ceil(total / PAGE_SIZE) : (rows.length === PAGE_SIZE ? page + 2 : page + 1);

  return (
    <div className="space-y-4">
      {/* Intestazione + barra comandi */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-primary tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-secondary" />
            Gestione utenti
          </h2>
          <p className="text-xs text-on-surface-variant font-medium mt-1">
            Profilo, consumo reale, crediti e provvedimenti: tutto da qui, senza SQL.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/40" />
            <input
              type="text"
              value={rawQuery}
              onChange={e => setRawQuery(e.target.value)}
              placeholder="Cerca per email o nome…"
              className="w-full bg-[#f8f5f0] pl-9 pr-3 py-2.5 border-none rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <select
            value={sort}
            onChange={e => { setSort(e.target.value as SortKey); setPage(0); }}
            className="bg-surface border border-outline-variant rounded-xl px-3 py-2.5 text-xs font-black uppercase tracking-wider text-on-surface-variant"
          >
            <option value="created_at">Più recenti</option>
            <option value="credits">Più crediti</option>
            <option value="email">Email A-Z</option>
          </select>
          <button
            onClick={load}
            disabled={loading}
            title="Ricarica l'elenco"
            className="p-2.5 bg-surface border border-outline-variant rounded-xl hover:bg-surface-variant transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-primary' : 'text-on-surface-variant'}`} />
          </button>
          <button
            onClick={() => setExportOpen(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-surface border border-outline-variant rounded-xl text-xs font-black text-on-surface-variant hover:text-primary transition-colors"
          >
            <Download className="w-4 h-4" /> Esporta CSV
          </button>
        </div>
      </div>

      {exportOpen && <TransactionsExport onClose={() => setExportOpen(false)} />}

      {degraded && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] font-bold text-amber-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
          <span>
            Rotta <code className="font-mono">/api/admin/users</code> non ancora pubblicata: l'elenco arriva dalla
            lettura diretta di <code className="font-mono">user_profiles</code>. Ordinamento e ricerca funzionano,
            i totali aggregati del server no.
          </span>
        </div>
      )}

      {/* Conteggio + paginazione in testa */}
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-[11px] font-bold text-on-surface-variant">
          {loading ? 'Caricamento…' : total > 0
            ? `${nf(total)} ${total === 1 ? 'utente' : 'utenti'}${query ? ` per "${query}"` : ''}`
            : `${rows.length} in pagina`}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className="p-1.5 rounded-lg border border-outline-variant disabled:opacity-30 hover:bg-surface-variant"
          >
            <ChevronLeft className="w-4 h-4 text-on-surface-variant" />
          </button>
          <span className="text-[11px] font-black tabular-nums text-on-surface-variant">
            {page + 1}{pages > 0 ? ` / ${pages}` : ''}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={loading || rows.length < PAGE_SIZE}
            className="p-1.5 rounded-lg border border-outline-variant disabled:opacity-30 hover:bg-surface-variant"
          >
            <ChevronRight className="w-4 h-4 text-on-surface-variant" />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm font-medium text-red-700 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {error}</span>
          <button onClick={load} className="px-3 py-1.5 bg-red-100 rounded-lg text-xs font-black shrink-0">Riprova</button>
        </div>
      )}

      {/* Tabella */}
      <div className="overflow-x-auto no-scrollbar rounded-2xl border border-outline-variant bg-surface">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-[#f8f5f0] text-[10px] font-black uppercase tracking-wider text-on-surface-variant/60">
            <tr>
              <th className="p-4">Utente</th>
              <th className="p-4 text-center">Piano</th>
              <th className="p-4 text-center">Acquistati</th>
              <th className="p-4 text-center">Ottenuti</th>
              <th className="p-4 text-center">Totale</th>
              <th className="p-4 text-center">XP</th>
              <th className="p-4 text-right">Iscritto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/40 font-medium">
            {loading && rows.length === 0 && (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  <td colSpan={7} className="p-4">
                    <div className="h-6 bg-[#f1ede6] rounded-lg animate-pulse" />
                  </td>
                </tr>
              ))
            )}

            {!loading && rows.length === 0 && !error && (
              <tr>
                <td colSpan={7} className="p-12 text-center">
                  <Inbox className="w-8 h-8 mx-auto text-on-surface-variant/30 mb-2" />
                  <p className="text-xs font-bold text-on-surface-variant">
                    {query ? `Nessun utente trovato per "${query}".` : 'Nessun utente registrato.'}
                  </p>
                </td>
              </tr>
            )}

            {rows.map(u => {
              const premium = u.is_forever_premium || (u.premium_until && new Date(u.premium_until) > new Date());
              return (
                <tr
                  key={u.id}
                  onClick={() => setSelected(u)}
                  className="hover:bg-[#faf9f6] cursor-pointer transition-colors"
                >
                  <td className="p-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center text-sm font-black uppercase shrink-0">
                        {(u.display_name?.[0] || u.email?.[0] || 'U')}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-primary flex items-center gap-1.5 flex-wrap">
                          <span className="truncate max-w-[220px]">{u.display_name || u.email || 'Utente senza nome'}</span>
                          {u.is_admin && (
                            <span className="text-[8px] font-black uppercase tracking-wider bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded">Admin</span>
                          )}
                          {premium && (
                            <span className="text-[8px] font-black uppercase tracking-wider bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Premium</span>
                          )}
                        </p>
                        {u.display_name && <p className="text-[10px] text-on-surface-variant/70 truncate">{u.email}</p>}
                        <p className="text-[9px] font-mono text-on-surface-variant/40 truncate">{u.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${
                      (u.subscription_tier || 'free') === 'free' ? 'bg-gray-100 text-gray-600' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {u.subscription_tier || 'free'}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <span className="text-[11px] font-black tabular-nums bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full">{nf(u.purchased_credits)}</span>
                  </td>
                  <td className="p-4 text-center">
                    <span className="text-[11px] font-black tabular-nums bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full">{nf(u.earned_credits)}</span>
                  </td>
                  <td className="p-4 text-center font-black tabular-nums text-on-surface">{nf(totalCredits(u))}</td>
                  <td className="p-4 text-center text-xs font-bold tabular-nums text-on-surface-variant">{nf(u.xp_points)}</td>
                  <td className="p-4 text-right text-[11px] font-bold text-on-surface-variant whitespace-nowrap">{dateIt(u.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <UserDetailPanel
          user={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

/* ── Esportazione CSV transazioni ────────────────────────────────────────── */

/**
 * La rotta pretende from/to in YYYY-MM-DD (max 90 giorni) e vuole il Bearer:
 * un <a href> non lo puo' portare, quindi si scarica via fetch + blob.
 */
function TransactionsExport({ onClose }: { onClose: () => void }) {
  const today = new Date();
  const monthAgo = new Date(Date.now() - 30 * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const [from, setFrom] = useState(iso(monthAgo));
  const [to, setTo] = useState(iso(today));
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const res = await fetch(
        getApiUrl(`/api/admin/export/transactions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
        { headers: await adminAuthHeaders() }
      );
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { msg = (await res.json())?.error || msg; } catch { /* corpo non JSON */ }
        throw new Error(res.status === 404 ? 'Rotta di esportazione non disponibile su questo server.' : msg);
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
      notify('CSV transazioni scaricato.', 'success');
      onClose();
    } catch (e) {
      notify(`Esportazione fallita: ${errText(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-surface border border-outline-variant rounded-2xl p-4 flex flex-wrap items-end gap-3">
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Dal</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="bg-[#f8f5f0] border-none rounded-xl px-3 py-2 text-xs font-bold" />
      </div>
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Al</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="bg-[#f8f5f0] border-none rounded-xl px-3 py-2 text-xs font-bold" />
      </div>
      <button onClick={download} disabled={busy}
        className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-black disabled:opacity-50 flex items-center gap-1.5">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Scarica
      </button>
      <p className="text-[10px] text-on-surface-variant/70 font-medium flex-1 min-w-[180px]">
        Movimenti crediti di tutti gli utenti nel periodo. Il server accetta al massimo 90 giorni per volta.
      </p>
      <button onClick={onClose} className="p-1.5 text-on-surface-variant/50 hover:text-primary"><X className="w-4 h-4" /></button>
    </div>
  );
}

/* ── Scheda utente ───────────────────────────────────────────────────────── */

function UserDetailPanel({ user, onClose, onChanged }: {
  user: AdminUserRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [days, setDays] = useState(30);
  const [detail, setDetail] = useState<UsageResponse | null>(null);
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [usageMissing, setUsageMissing] = useState(false);
  /** Azione in corso: un solo bottone alla volta resta bloccato */
  const [busy, setBusy] = useState<string>('');

  const profile: AdminUserRow = { ...user, ...(detail?.profile || {}) };

  /* Ripiego quando /api/admin/user/usage non esiste: quote e movimenti si
     leggono comunque da Supabase, il riepilogo consumi no (richiede
     l'aggregazione dei log lato server). */
  const loadFallback = useCallback(async () => {
    const [quotaRes, txRes] = await Promise.allSettled([
      supabase.from('user_quotas').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('credit_transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
    ]);
    setDetail({
      quota: quotaRes.status === 'fulfilled' ? ((quotaRes.value as any)?.data || null) : null,
      transactions: txRes.status === 'fulfilled' ? ((txRes.value as any)?.data || []) : [],
      usage: null,
    });
  }, [user.id]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [usageRes, statusRes] = await Promise.allSettled([
      adminApi<UsageResponse>(`/api/admin/user/usage?user_id=${encodeURIComponent(user.id)}&userId=${encodeURIComponent(user.id)}&days=${days}`),
      adminApi<AuthStatus>(`/api/admin/user/status?user_id=${encodeURIComponent(user.id)}&userId=${encodeURIComponent(user.id)}`),
    ]);

    if (usageRes.status === 'fulfilled') {
      setUsageMissing(false);
      setDetail(usageRes.value || {});
      // Alcuni server tornano il riepilogo senza il libro mastro: lo si completa
      if (!Array.isArray(usageRes.value?.transactions)) {
        const { data } = await supabase
          .from('credit_transactions').select('*')
          .eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
        setDetail(prev => ({ ...(prev || {}), transactions: data || [] }));
      }
    } else if (isRouteMissing(usageRes.reason)) {
      setUsageMissing(true);
      try { await loadFallback(); } catch (e) { setError(errText(e)); }
    } else {
      setError(errText(usageRes.reason));
      try { await loadFallback(); } catch { /* anche il ripiego è giù: resta l'errore sopra */ }
    }

    setStatus(statusRes.status === 'fulfilled' ? (statusRes.value || null) : null);
    setLoading(false);
  }, [user.id, days, loadFallback]);

  useEffect(() => { load(); }, [load]);

  const usage = detail?.usage;
  const byApi = (usage?.by_api || []).filter(Boolean);
  const byFeature = (usage?.by_feature || []).filter(Boolean);
  const maxApi = useMemo(() => Math.max(1, ...byApi.map(b => Number(b.calls) || 0)), [byApi]);
  const maxFeature = useMemo(() => Math.max(1, ...byFeature.map(b => Number(b.calls) || 0)), [byFeature]);
  const pairs = quotaPairs(detail?.quota);
  const isBanned = !!status?.banned;

  /** Ogni azione ricarica i dati toccati e lascia un riscontro visibile. */
  const run = async (id: string, fn: () => Promise<string>, refreshList = true) => {
    setBusy(id);
    try {
      const msg = await fn();
      notify(msg, 'success');
      await load();
      if (refreshList) onChanged();
    } catch (e) {
      notify(isRouteMissing(e)
        ? 'Operazione non disponibile: la rotta non è ancora pubblicata su questo server.'
        : `Operazione fallita: ${errText(e)}`);
    } finally {
      setBusy('');
    }
  };

  /* — Azioni — */

  const [wallet, setWallet] = useState<'purchased' | 'earned'>('purchased');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const doAdjust = () => {
    const amt = Math.trunc(Number(amount));
    if (!amt) { notify('Inserisci un importo diverso da zero (negativo per togliere).'); return; }
    if (reason.trim().length < 5) { notify('Causale obbligatoria (minimo 5 caratteri).'); return; }
    if (amt < 0 && !window.confirm(`Togliere ${Math.abs(amt)} crediti a ${profile.email || profile.id}?`)) return;
    return run('adjust', async () => {
      const data = await adminApi<any>('/api/admin/user/credit-adjust', {
        method: 'POST',
        // doppia forma: contratto storico (userId/wallet/amount) e nuovo (user_id/delta)
        body: JSON.stringify({ userId: user.id, user_id: user.id, wallet, amount: amt, delta: amt, reason: reason.trim() }),
      });
      setAmount('');
      setReason('');
      // IL SALDO IN CIMA RESTAVA QUELLO VECCHIO (29/08/2026, collaudo): la
      // rettifica scriveva sul database e la scheda admin si riallineava, ma
      // l'intestazione del Profilo continuava a mostrare i crediti di prima
      // fino al riavvio dell'app — chi si accredita un rimborso pensava non
      // fosse arrivato. `notifyCreditsChanged` e` lo stesso canale che usano
      // gli acquisti (pricing.ts): riallinea header, shop e badge.
      notifyCreditsChanged({ userId: user.id });
      const applied = data?.applied != null ? data.applied : amt;
      return `Rettifica applicata: ${applied >= 0 ? '+' : ''}${applied} crediti ${wallet === 'purchased' ? 'acquistati' : 'ottenuti'}.`;
    });
  };

  const doToggleAdmin = () => {
    const next = !profile.is_admin;
    if (!window.confirm(next
      ? `Promuovere ${profile.email || profile.id} ad amministratore? Avrà accesso a tutto il pannello.`
      : `Revocare i privilegi di amministratore a ${profile.email || profile.id}?`)) return;
    return run('admin', async () => {
      try {
        await adminApi('/api/admin/user/set-admin', {
          method: 'POST',
          body: JSON.stringify({ user_id: user.id, userId: user.id, is_admin: next }),
        });
      } catch (e) {
        if (!isRouteMissing(e)) throw e;
        // Ripiego: scrittura diretta, protetta comunque dal trigger RLS
        const { error: upErr } = await supabase.from('user_profiles').update({ is_admin: next }).eq('id', user.id);
        if (upErr) throw upErr;
      }
      return next ? 'Utente promosso amministratore.' : 'Privilegi di amministratore revocati.';
    });
  };

  const doResetQuota = () => {
    if (!window.confirm(`Azzerare i contatori di consumo di oggi per ${profile.email || profile.id}?`)) return;
    return run('quota', async () => {
      try {
        await adminApi('/api/admin/user/reset-quota', {
          method: 'POST',
          body: JSON.stringify({ user_id: user.id, userId: user.id }),
        });
      } catch (e) {
        if (!isRouteMissing(e)) throw e;
        // Ripiego: si azzerano solo i contatori realmente presenti sulla riga
        const zeroed: Record<string, number> = {};
        for (const p of pairs) zeroed[`${p.key}_used`] = 0;
        if (Object.keys(zeroed).length === 0) throw new Error('Nessun contatore da azzerare per questo utente.');
        const { error: upErr } = await supabase.from('user_quotas').update(zeroed).eq('user_id', user.id);
        if (upErr) throw upErr;
      }
      return 'Quote azzerate.';
    }, false);
  };

  /* Limiti e piano */
  const [limitItinerary, setLimitItinerary] = useState(profile.custom_limit_itinerary?.toString() ?? '');
  const [limitAudio, setLimitAudio] = useState(profile.custom_limit_audio_guide?.toString() ?? '');
  const [tier, setTier] = useState(profile.subscription_tier || 'free');
  const [forever, setForever] = useState(!!profile.is_forever_premium);
  const [premiumUntil, setPremiumUntil] = useState(profile.premium_until ? String(profile.premium_until).slice(0, 10) : '');
  const [limitsTouched, setLimitsTouched] = useState(false);

  // Il profilo completo arriva col dettaglio: i campi vanno riallineati una
  // volta sola, e mai sopra a quello che l'operatore sta scrivendo.
  useEffect(() => {
    if (limitsTouched || !detail?.profile) return;
    const p = detail.profile;
    setLimitItinerary(p.custom_limit_itinerary?.toString() ?? '');
    setLimitAudio(p.custom_limit_audio_guide?.toString() ?? '');
    setTier(p.subscription_tier || 'free');
    setForever(!!p.is_forever_premium);
    setPremiumUntil(p.premium_until ? String(p.premium_until).slice(0, 10) : '');
  }, [detail?.profile, limitsTouched]);

  const doSaveLimits = () => run('limits', async () => {
    const payload = {
      user_id: user.id,
      userId: user.id,
      custom_limit_itinerary: limitItinerary === '' ? null : Math.max(0, Math.trunc(Number(limitItinerary) || 0)),
      custom_limit_audio_guide: limitAudio === '' ? null : Math.max(0, Math.trunc(Number(limitAudio) || 0)),
      subscription_tier: tier,
      is_forever_premium: forever,
      premium_until: premiumUntil ? new Date(`${premiumUntil}T23:59:59.000Z`).toISOString() : null,
    };
    try {
      await adminApi('/api/admin/user/set-limits', { method: 'POST', body: JSON.stringify(payload) });
    } catch (e) {
      if (!isRouteMissing(e)) throw e;
      const { user_id, userId, ...cols } = payload;
      const { error: upErr } = await supabase.from('user_profiles').update(cols).eq('id', user.id);
      if (upErr) throw upErr;
    }
    setLimitsTouched(false);
    return 'Limiti e piano aggiornati.';
  });

  /* Sospensione */
  const [banDuration, setBanDuration] = useState('24h');
  const [banReason, setBanReason] = useState('');

  const doBan = (banned: boolean) => {
    if (banned) {
      if (banReason.trim().length < 5) { notify('Causale obbligatoria per sospendere (minimo 5 caratteri).'); return; }
      if (!window.confirm(`Sospendere ${profile.email || profile.id}? Non potrà più accedere finché non viene riattivato.`)) return;
    } else if (!window.confirm(`Riattivare ${profile.email || profile.id}?`)) return;

    return run('ban', async () => {
      await adminApi('/api/admin/user/ban', {
        method: 'POST',
        // banned per il contratto storico, ban_duration per quello nuovo
        body: JSON.stringify({
          userId: user.id,
          user_id: user.id,
          banned,
          ban_duration: banned ? banDuration : 'none',
          reason: banned ? banReason.trim() : undefined,
        }),
      });
      setBanReason('');
      return banned ? 'Utente sospeso.' : 'Utente riattivato.';
    }, false);
  };

  return (
    <div className="fixed inset-0 z-[1300] bg-black/50 flex" onClick={onClose}>
      {/* Sotto i 768px il dettaglio prende tutto lo schermo, sopra è un cassetto laterale */}
      <div
        className="ml-auto w-full md:max-w-3xl h-full bg-[#faf9f6] overflow-y-auto p-4 md:p-5 space-y-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Testata */}
        <div className="flex items-start justify-between gap-3 sticky top-0 -mt-4 md:-mt-5 pt-4 md:pt-5 pb-3 bg-[#faf9f6] z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-orange-100 text-orange-700 flex items-center justify-center text-lg font-black uppercase shrink-0">
              {(profile.display_name?.[0] || profile.email?.[0] || 'U')}
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-primary text-base truncate">{profile.display_name || profile.email || 'Utente senza nome'}</h3>
              {profile.display_name && <p className="text-xs font-bold text-on-surface-variant truncate">{profile.email}</p>}
              <p className="text-[10px] font-mono text-on-surface-variant/50 truncate">{profile.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={load} disabled={loading} title="Ricarica la scheda"
              className="p-2 rounded-xl border border-outline-variant bg-surface">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-primary' : 'text-on-surface-variant'}`} />
            </button>
            <button onClick={onClose} className="p-2 rounded-xl border border-outline-variant bg-surface">
              <X className="w-4 h-4 text-on-surface-variant" />
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-700 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {error}</span>
            <button onClick={load} className="px-3 py-1.5 bg-red-100 rounded-lg text-[11px] font-black shrink-0">Riprova</button>
          </div>
        )}

        {/* Stato account + saldi */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className={`rounded-2xl p-3 border text-center ${isBanned ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200/60'}`}>
            <div className={`text-lg font-black ${isBanned ? 'text-red-600' : 'text-emerald-700'}`}>
              {status ? (isBanned ? 'SOSPESO' : 'ATTIVO') : '…'}
            </div>
            <div className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/60">
              {status?.last_sign_in_at ? `accesso ${dateIt(status.last_sign_in_at)}` : 'stato account'}
            </div>
          </div>
          <div className="rounded-2xl p-3 border bg-blue-50 border-blue-200/60 text-center">
            <div className="text-lg font-black text-blue-700 tabular-nums">{nf(profile.purchased_credits)}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-blue-500">Acquistati</div>
          </div>
          <div className="rounded-2xl p-3 border bg-amber-50 border-amber-200/60 text-center">
            <div className="text-lg font-black text-amber-700 tabular-nums">{nf(profile.earned_credits)}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-amber-500">Ottenuti</div>
          </div>
          <div className="rounded-2xl p-3 border bg-surface border-outline-variant text-center">
            <div className="text-lg font-black text-on-surface tabular-nums flex items-center justify-center gap-1">
              <Trophy className="w-4 h-4 text-purple-500" />{nf(profile.xp_points)}
            </div>
            <div className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/60">Punti XP</div>
          </div>
        </div>

        {/* Anagrafica */}
        <Section title="Profilo" icon={<CalendarClock className="w-3.5 h-3.5" />}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/50">Iscritto il</p>
              <p className="font-bold text-on-surface">{dateIt(profile.created_at || status?.created_at)}</p>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/50">Piano</p>
              <p className="font-bold text-on-surface capitalize">{profile.subscription_tier || 'free'}</p>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/50">Ruolo</p>
              <p className="font-bold text-on-surface">{profile.is_admin ? 'Amministratore' : 'Utente'}</p>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/50">Itinerari creati</p>
              <p className="font-bold text-on-surface tabular-nums">{detail?.itineraries_count != null ? nf(detail.itineraries_count) : '—'}</p>
            </div>
          </div>
        </Section>

        {/* Quote di oggi */}
        <Section
          title="Quote di oggi"
          icon={<Gauge className="w-3.5 h-3.5" />}
          right={
            <button
              onClick={doResetQuota}
              disabled={busy === 'quota'}
              className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-[11px] font-black disabled:opacity-50 flex items-center gap-1.5"
            >
              {busy === 'quota' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Azzera
            </button>
          }
        >
          {loading && !detail ? (
            <div className="h-16 bg-[#f1ede6] rounded-xl animate-pulse" />
          ) : pairs.length === 0 ? (
            <p className="text-xs font-medium text-on-surface-variant/70">
              Nessun contatore di consumo per oggi: l'utente non ha ancora usato funzioni a quota.
            </p>
          ) : (
            <div className="space-y-2.5">
              {pairs.map(p => {
                const pct = p.limit && p.limit > 0 ? Math.min(100, (p.used / p.limit) * 100) : 0;
                const tone = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
                return (
                  <div key={p.key}>
                    <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                      <span className="text-on-surface capitalize">{p.label}</span>
                      <span className="tabular-nums text-on-surface-variant">
                        {nf(p.used)} / {p.limit == null ? '∞' : p.limit >= 9999 ? '∞' : nf(p.limit)}
                      </span>
                    </div>
                    <div className="h-2 bg-[#eee9e0] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Consumo */}
        <Section
          title="Consumo"
          icon={<Activity className="w-3.5 h-3.5" />}
          right={
            <div className="flex bg-[#f1ede6] rounded-lg p-0.5">
              {[7, 30, 90].map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${
                    days === d ? 'bg-surface text-primary shadow-sm' : 'text-on-surface-variant'
                  }`}
                >
                  {d}g
                </button>
              ))}
            </div>
          }
        >
          {usageMissing ? (
            <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
              <span>
                Riepilogo consumi non disponibile: la rotta <code className="font-mono">/api/admin/user/usage</code> non
                è ancora pubblicata su questo server. Quote e movimenti qui sotto arrivano comunque dal database.
              </span>
            </p>
          ) : loading && !usage ? (
            <div className="h-20 bg-[#f1ede6] rounded-xl animate-pulse" />
          ) : !usage ? (
            <p className="text-xs font-medium text-on-surface-variant/70">Nessun consumo registrato nel periodo.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <Kpi tone="blue" icon={<Zap className="w-4 h-4" />} label="Chiamate" value={nf(usage.calls)}
                  hint={`ultimi ${days} giorni`} />
                <Kpi tone="purple" icon={<Server className="w-4 h-4" />} label="Token"
                  value={(Number(usage.tokens) || 0) >= 1000 ? `${((Number(usage.tokens) || 0) / 1000).toFixed(1)}K` : nf(usage.tokens)}
                  hint={`${nf(usage.tokens)} totali`} />
                <Kpi tone="emerald" icon={<DollarSign className="w-4 h-4" />} label="Costo stimato" value={money(usage.cost)}
                  hint={`media ${money((Number(usage.cost) || 0) / Math.max(1, Number(usage.calls) || 0))}/chiamata`} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RankedList title="Per API" rows={byApi} max={maxApi} bar="bg-blue-400" />
                <RankedList title="Per funzione" rows={byFeature} max={maxFeature} bar="bg-purple-400" />
              </div>
            </div>
          )}
        </Section>

        {/* Movimenti crediti */}
        <Section title="Ultimi movimenti crediti" icon={<Coins className="w-3.5 h-3.5" />}>
          {loading && !detail ? (
            <div className="h-16 bg-[#f1ede6] rounded-xl animate-pulse" />
          ) : !detail?.transactions || detail.transactions.length === 0 ? (
            <p className="text-xs font-medium text-on-surface-variant/70">Nessun movimento registrato.</p>
          ) : (
            <div className="border border-outline-variant rounded-xl overflow-hidden divide-y divide-outline-variant/50 max-h-64 overflow-y-auto">
              {detail.transactions.slice(0, 50).map((tx: any, i: number) => (
                <div key={tx.id || i} className="flex items-center gap-3 px-3 py-2 bg-surface">
                  {Number(tx.amount) >= 0
                    ? <ArrowUpCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    : <ArrowDownCircle className="w-4 h-4 text-red-400 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-on-surface truncate">{tx.description || tx.type || 'movimento'}</p>
                    <p className="text-[10px] text-on-surface-variant/70">
                      {dateTimeIt(tx.created_at)}{tx.source ? ` · ${tx.source}` : ''}
                    </p>
                  </div>
                  <span className={`text-sm font-black tabular-nums ${Number(tx.amount) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {Number(tx.amount) >= 0 ? '+' : ''}{nf(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Rettifica crediti — ed e' anche l'UNICA forma di rimborso prevista:
            si restituiscono crediti, mai denaro. Scritto in chiaro qui sotto
            perche' altrimenti si cerca a lungo un bottone che non esiste. */}
        <Section title="Rettifica crediti (rimborsi)" icon={<Wallet className="w-3.5 h-3.5" />}>
          <div className="flex flex-col sm:flex-row gap-2">
            <select value={wallet} onChange={e => setWallet(e.target.value as 'purchased' | 'earned')}
              className="bg-surface border border-outline-variant rounded-xl px-3 py-2 text-xs font-bold">
              <option value="purchased">Acquistati</option>
              <option value="earned">Ottenuti</option>
            </select>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="+50 / -20"
              className="w-full sm:w-28 bg-surface border border-outline-variant rounded-xl px-3 py-2 text-xs font-bold tabular-nums" />
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Causale (es. crediti non accreditati, ordine #123)"
              className="flex-1 bg-surface border border-outline-variant rounded-xl px-3 py-2 text-xs" />
            <button onClick={doAdjust} disabled={busy === 'adjust'}
              className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-black disabled:opacity-50 shrink-0 flex items-center justify-center gap-1.5">
              {busy === 'adjust' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Applica'}
            </button>
          </div>
          <p className="text-[10px] text-on-surface-variant/70">
            Causale obbligatoria (minimo 5 caratteri): ogni rettifica finisce nel libro mastro e nell'audit
            (Errori di Sistema → user_admin).
          </p>
          <p className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            I rimborsi si fanno <strong>solo in crediti</strong>: non esiste il rimborso in denaro.
            Per un acquisto contestato accredita qui i crediti corrispondenti sul portafoglio «Acquistati»,
            indicando l'ordine nella causale.
          </p>
        </Section>

        {/* Limiti e piano */}
        <Section title="Limiti e piano" icon={<Crown className="w-3.5 h-3.5" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Limite itinerari/giorno</label>
              <input type="number" min="0" value={limitItinerary}
                onChange={e => { setLimitItinerary(e.target.value); setLimitsTouched(true); }}
                placeholder="vuoto = limite del piano"
                className="w-full bg-surface border border-outline-variant rounded-xl px-3 py-2 text-xs font-bold tabular-nums" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Limite audioguide/giorno</label>
              <input type="number" min="0" value={limitAudio}
                onChange={e => { setLimitAudio(e.target.value); setLimitsTouched(true); }}
                placeholder="vuoto = limite del piano"
                className="w-full bg-surface border border-outline-variant rounded-xl px-3 py-2 text-xs font-bold tabular-nums" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Piano</label>
              <select value={tier} onChange={e => { setTier(e.target.value); setLimitsTouched(true); }}
                className="w-full bg-surface border border-outline-variant rounded-xl px-3 py-2 text-xs font-bold">
                <option value="free">free</option>
                <option value="premium">premium</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1 block">Premium fino al</label>
              <input type="date" value={premiumUntil}
                onChange={e => { setPremiumUntil(e.target.value); setLimitsTouched(true); }}
                disabled={forever}
                className="w-full bg-surface border border-outline-variant rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50" />
            </div>
          </div>
          <label className="flex items-center gap-2.5 bg-[#f8f5f0] p-3 rounded-xl cursor-pointer">
            <input type="checkbox" checked={forever}
              onChange={e => { setForever(e.target.checked); setLimitsTouched(true); }}
              className="w-4 h-4 rounded border-gray-300" />
            <span className="text-xs font-bold text-on-surface select-none">Premium a vita (ignora la data di scadenza)</span>
          </label>
          <button onClick={doSaveLimits} disabled={busy === 'limits'}
            className="w-full sm:w-auto px-5 py-2.5 bg-primary text-white rounded-xl text-xs font-black disabled:opacity-50 flex items-center justify-center gap-1.5">
            {busy === 'limits' ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Salva limiti e piano
          </button>
        </Section>

        {/* Provvedimenti */}
        <Section title="Provvedimenti" icon={<ShieldCheck className="w-3.5 h-3.5" />}>
          {/* Ruolo admin */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-surface border border-outline-variant rounded-xl p-3">
            <div className="text-xs font-bold text-on-surface flex items-center gap-2">
              <UserCog className="w-4 h-4 text-on-surface-variant" />
              {profile.is_admin ? 'Ha accesso completo al pannello di amministrazione.' : 'Utente normale, nessun accesso al pannello.'}
            </div>
            <button onClick={doToggleAdmin} disabled={busy === 'admin'}
              className={`px-4 py-2 rounded-xl text-xs font-black disabled:opacity-50 flex items-center gap-1.5 ${
                profile.is_admin ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-[#f1ede6] text-on-surface border border-outline-variant'
              }`}>
              {busy === 'admin' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {profile.is_admin ? 'Revoca admin' : 'Rendi admin'}
            </button>
          </div>

          {/* Sospensione */}
          <div className="bg-surface border border-outline-variant rounded-xl p-3 space-y-2">
            <div className="text-xs font-bold text-on-surface">
              {isBanned
                ? `Account sospeso${status?.banned_until ? ` fino al ${dateIt(status.banned_until)}` : ''}.`
                : 'Account attivo: può accedere e spendere i crediti.'}
            </div>
            {!isBanned && (
              <div className="flex flex-col sm:flex-row gap-2">
                <select value={banDuration} onChange={e => setBanDuration(e.target.value)}
                  className="bg-[#f8f5f0] border-none rounded-xl px-3 py-2 text-xs font-bold">
                  <option value="24h">24 ore</option>
                  <option value="168h">7 giorni</option>
                  <option value="720h">30 giorni</option>
                  <option value="876000h">Permanente</option>
                </select>
                <input value={banReason} onChange={e => setBanReason(e.target.value)}
                  placeholder="Causale della sospensione (obbligatoria)"
                  className="flex-1 bg-[#f8f5f0] border-none rounded-xl px-3 py-2 text-xs" />
              </div>
            )}
            <button onClick={() => doBan(!isBanned)} disabled={busy === 'ban' || !status}
              className={`w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-black disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                isBanned ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'
              }`}>
              {busy === 'ban' ? <Loader2 className="w-4 h-4 animate-spin" /> : isBanned ? <ShieldCheck className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
              {isBanned ? 'Riattiva account' : 'Sospendi account'}
            </button>
            {!status && (
              <p className="text-[10px] font-bold text-on-surface-variant/60 flex items-center gap-1.5">
                <ShieldOff className="w-3 h-3" /> Stato auth non leggibile: la sospensione resta bloccata finché non si conosce lo stato attuale.
              </p>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ── Classifica con barre proporzionali ──────────────────────────────────── */

function RankedList({ title, rows, max, bar }: {
  title: string; rows: UsageBucket[]; max: number; bar: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50 mb-2">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs font-medium text-on-surface-variant/60">Nessun dato.</p>
      ) : (
        <div className="space-y-2">
          {rows.slice(0, 10).map((r, i) => {
            const calls = Number(r.calls) || 0;
            return (
              <div key={`${r.name || i}`}>
                <div className="flex items-center justify-between gap-2 text-[11px] font-bold mb-0.5">
                  <span className="text-on-surface truncate">{r.name || '—'}</span>
                  <span className="tabular-nums text-on-surface-variant shrink-0">
                    {nf(calls)} · {money(r.cost)}
                  </span>
                </div>
                <div className="h-1.5 bg-[#eee9e0] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, (calls / max) * 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
