import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { getApiUrl } from '../../lib/api';
import {
  Coins, Database, HeartPulse, PiggyBank, RefreshCw, Play, Save, RotateCcw,
  Trash2, AlertTriangle, CheckCircle2, XCircle, ChevronDown, ChevronUp,
  Search, Bird, ShieldAlert, Info
} from 'lucide-react';

/**
 * CONSOLE DI GOVERNO — le leve economiche e operative che oggi richiedono
 * un deploy per essere mosse. Quattro sotto-schede:
 *   A. Listino crediti  → prezzi delle feature senza toccare il codice
 *   B. Cache            → ispezione e pulizia di api_cache
 *   C. Salute e canarino → health check REALI on-demand + storico canarino
 *   D. Budget AI        → tetto mensile e allarme di sforamento
 *
 * Tutte le rotte sono admin-only: il token di sessione Supabase viaggia nel
 * Bearer, come nelle altre schede del pannello.
 */

// Header di autenticazione admin condiviso da tutte le sezioni.
const adminAuthHeaders = async (): Promise<Record<string, string>> => {
  const { data: s } = await supabase.auth.getSession();
  const token = s?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/** Riquadro "rotta non ancora disponibile": un 404 non è un guasto, è una
 *  funzione lato server non ancora rilasciata. Va detto in tono neutro,
 *  altrimenti l'admin pensa che l'app sia rotta e apre un ticket. */
function NotYetAvailable({ what, routes }: { what: string; routes: string[] }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-1.5">
      <div className="flex items-center gap-2 text-amber-800 font-black text-sm">
        <Info className="w-4 h-4 shrink-0" />
        {what}: non ancora disponibile su questo server
      </div>
      <p className="text-[11px] text-amber-800/80 font-medium leading-snug">
        Il pannello è pronto, ma il backend non espone (ancora) le rotte necessarie. Arriveranno col prossimo
        deploy: fino ad allora questa sezione resta in sola lettura e non c'è nulla da riparare.
      </p>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {routes.map(r => (
          <code key={r} className="text-[10px] font-mono font-bold bg-white/70 border border-amber-200 text-amber-900 rounded-lg px-2 py-0.5">{r}</code>
        ))}
      </div>
    </div>
  );
}

/** Barra di errore riprovabile: stessa forma in tutte le sezioni. */
function ErrorBar({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 flex flex-wrap items-center gap-2">
      <XCircle className="w-4 h-4 text-red-600 shrink-0" />
      <span className="text-[11px] font-bold text-red-700 flex-1 min-w-[140px]">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-[11px] font-black flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Riprova
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// A. LISTINO CREDITI
// ═══════════════════════════════════════════════════════════════════════

/**
 * Nomi leggibili delle voci di listino. Le chiavi tecniche sono quelle
 * condivise da SERVER_PRICING (server.ts) e PRICING_LIST (src/lib/pricing.ts):
 * finché non esistevano gli override, cambiare un prezzo voleva dire toccare
 * DUE file e rifare il deploy — con il rischio concreto di disallinearli.
 */
const PRICING_LABELS: Record<string, { label: string; hint?: string }> = {
  audio_guide: { label: 'Audioguida', hint: 'Narrazione TTS di un singolo POI' },
  itinerary_daily: { label: 'Itinerario (al giorno)', hint: 'Addebitato per ogni giorno pianificato' },
  photo_search: { label: 'Vision / riconoscimento foto', hint: 'Una scansione dalla fotocamera' },
  poi_detail: { label: 'Scheda POI arricchita', hint: 'Wikipedia + Wikidata + foto' },
  premium_guide_daily: { label: 'Guida premium (al giorno)', hint: 'La guida in PDF' },
  podcast_daily: { label: 'Podcast (al giorno)' },
  chat_session: { label: 'Chat (pacchetto 10 messaggi)' },
  museum_pass: { label: 'Pass Museo', hint: 'Vision illimitata per 4 ore, visita indoor' },
  day_pass: { label: 'Day Pass', hint: '24h hands-free, max 40 audioguide' },
  replace_stop: { label: 'Sostituisci tappa' },
  extend_itinerary_day: { label: 'Aggiungi giorno/tappa', hint: 'Su un itinerario già esistente' },
  chiedi_di_piu: { label: 'Chiedi di più', hint: 'Approfondimenti mentre si ascolta' },
};

/** Chiave sconosciuta (aggiunta lato server dopo questa UI): si mostra
 *  comunque, resa leggibile alla meglio — mai nascondere una voce di
 *  listino solo perché il front-end non la conosce. */
const prettifyKey = (k: string) => k.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

function PricingSection() {
  const [defaults, setDefaults] = useState<Record<string, number>>({});
  const [effective, setEffective] = useState<Record<string, number>>({});
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [okMsg, setOkMsg] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    setOkMsg('');
    try {
      const res = await fetch(getApiUrl('/api/admin/pricing'), { headers: await adminAuthHeaders() });
      if (res.status === 404) { setUnavailable(true); setLoading(false); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const def: Record<string, number> = data?.defaults && typeof data.defaults === 'object' ? data.defaults : {};
      const eff: Record<string, number> = data?.pricing && typeof data.pricing === 'object' ? data.pricing : def;
      setUnavailable(false);
      setDefaults(def);
      setEffective(eff);
      setUpdatedAt(data?.updated_at || null);
      // Il draft parte SEMPRE dal valore in vigore, non dal default:
      // altrimenti un salvataggio distratto azzererebbe gli override.
      const keys = Array.from(new Set([...Object.keys(def), ...Object.keys(eff)]));
      const d: Record<string, string> = {};
      for (const k of keys) d[k] = String(eff[k] ?? def[k] ?? 0);
      setDraft(d);
    } catch (e: any) {
      setError(`Listino non caricato: ${e?.message || e}`);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const keys = useMemo(
    () => Array.from(new Set([...Object.keys(defaults), ...Object.keys(effective)])).sort(),
    [defaults, effective]
  );

  // Righe toccate rispetto a quanto è realmente in vigore adesso.
  const modified = keys.filter(k => Number(draft[k]) !== Number(effective[k] ?? defaults[k] ?? 0));
  // Righe che si discostano dal prezzo di fabbrica (override attivo o in bozza).
  const isOverride = (k: string) => Number(draft[k]) !== Number(defaults[k] ?? 0);

  const invalid = keys.filter(k => {
    const n = Number(draft[k]);
    return !Number.isInteger(n) || n < 0 || n > 10000;
  });

  const save = async () => {
    if (invalid.length > 0) {
      setError(`Valori non validi (servono interi da 0 a 10000): ${invalid.map(k => PRICING_LABELS[k]?.label || k).join(', ')}`);
      return;
    }
    const changedList = modified.map(k => {
      const label = PRICING_LABELS[k]?.label || prettifyKey(k);
      return `• ${label}: ${effective[k] ?? defaults[k]} → ${Number(draft[k])} crediti`;
    }).join('\n');
    if (!window.confirm(
      'CAMBIO LISTINO — stai modificando quanto pagano gli utenti.\n\n' +
      changedList + '\n\n' +
      'Il nuovo prezzo entra in vigore entro un minuto su tutti i client. Confermi?'
    )) return;

    setSaving(true);
    setError('');
    setOkMsg('');
    try {
      // Si inviano SOLO gli scostamenti dal default: così una voce riportata
      // al prezzo di fabbrica sparisce dagli override invece di restare
      // congelata a un valore che poi non seguirebbe più il codice.
      const overrides: Record<string, number> = {};
      for (const k of keys) {
        const n = Number(draft[k]);
        if (n !== Number(defaults[k] ?? 0)) overrides[k] = n;
      }
      const res = await fetch(getApiUrl('/api/admin/pricing'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await adminAuthHeaders()) },
        body: JSON.stringify({ overrides }),
      });
      if (res.status === 404) { setUnavailable(true); setSaving(false); return; }
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setOkMsg(`Listino salvato: ${Object.keys(overrides).length} ${Object.keys(overrides).length === 1 ? 'prezzo personalizzato' : 'prezzi personalizzati'}. Attivo entro un minuto.`);
      await load();
    } catch (e: any) {
      setError(`Salvataggio fallito: ${e?.message || e}`);
    }
    setSaving(false);
  };

  if (unavailable) {
    return (
      <div className="space-y-3">
        <NotYetAvailable what="Listino crediti" routes={['GET /api/admin/pricing', 'POST /api/admin/pricing']} />
        <button onClick={load} className="px-3 py-1.5 rounded-xl bg-surface-variant border border-outline-variant text-primary text-[11px] font-black flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Controlla di nuovo
        </button>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-2xl p-4 border border-outline-variant space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Coins className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <h3 className="font-black text-primary text-sm">💰 Listino crediti — prezzi senza deploy</h3>
            <p className="text-[11px] text-on-surface-variant leading-snug">
              Il prezzo di ogni funzione a pagamento. Il valore di fabbrica resta nel codice; qui si scrive
              un <b>override</b> che il server applica al posto suo. Serve per una promo o per correggere
              un prezzo sbagliato senza aspettare un rilascio.
            </p>
          </div>
        </div>
        <button onClick={load} disabled={loading} className="self-start p-1.5 rounded-lg text-on-surface-variant hover:text-blue-600 disabled:opacity-40" title="Ricarica listino">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="rounded-xl bg-blue-50 border border-blue-200 px-3 py-2 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-[11px] font-bold text-blue-800 leading-snug">
          Il cambio ha effetto <b>entro un minuto</b>: il server tiene il listino in cache per 60 secondi.
          Nel frattempo qualche richiesta può ancora essere addebitata al prezzo vecchio.
        </p>
      </div>

      {error && <ErrorBar message={error} onRetry={load} />}
      {okMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> {okMsg}
        </div>
      )}

      {loading ? (
        <div className="text-xs text-on-surface-variant italic">Caricamento listino...</div>
      ) : keys.length === 0 ? (
        <div className="text-xs text-on-surface-variant italic">Nessuna voce di listino restituita dal server.</div>
      ) : (
        <>
          <div className="space-y-1.5">
            {keys.map(k => {
              const meta = PRICING_LABELS[k];
              const def = Number(defaults[k] ?? 0);
              const overridden = isOverride(k);
              const touched = Number(draft[k]) !== Number(effective[k] ?? def);
              const bad = invalid.includes(k);
              return (
                <div
                  key={k}
                  className={`rounded-xl border p-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 ${
                    bad ? 'bg-red-50 border-red-200'
                      : overridden ? 'bg-amber-50 border-amber-200'
                      : 'bg-surface-variant/40 border-outline-variant'
                  }`}
                >
                  <div className="min-w-[150px] flex-1">
                    <div className="text-xs font-black text-primary flex items-center gap-1.5 flex-wrap">
                      {meta?.label || prettifyKey(k)}
                      {overridden && (
                        <span className="text-[9px] font-black uppercase tracking-wider bg-amber-500 text-white rounded-full px-1.5 py-0.5">
                          modificato
                        </span>
                      )}
                      {touched && (
                        <span className="text-[9px] font-black uppercase tracking-wider bg-blue-500 text-white rounded-full px-1.5 py-0.5">
                          da salvare
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-on-surface-variant leading-tight">
                      <code className="font-mono">{k}</code>{meta?.hint ? ` — ${meta.hint}` : ''}
                    </div>
                  </div>

                  <div className="text-[11px] font-bold text-on-surface-variant whitespace-nowrap" title="Prezzo di fabbrica, quello scritto nel codice">
                    default: <span className="font-black text-primary">{def}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={10000}
                      step={1}
                      value={draft[k] ?? ''}
                      onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))}
                      className={`w-20 px-2 py-1.5 rounded-lg border text-xs font-black text-right ${
                        bad ? 'border-red-400 text-red-700' : 'border-outline-variant text-primary'
                      } bg-white`}
                      aria-label={`Prezzo in crediti di ${meta?.label || k}`}
                    />
                    <span className="text-[10px] font-bold text-on-surface-variant">cr</span>
                    <button
                      onClick={() => setDraft(d => ({ ...d, [k]: String(def) }))}
                      disabled={!overridden}
                      title="Riporta questa voce al prezzo di fabbrica (poi salva)"
                      className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-outline-variant/30 disabled:opacity-30 disabled:hover:bg-transparent"
                      aria-label={`Ripristina ${meta?.label || k}`}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-outline-variant/50">
            <button
              onClick={save}
              disabled={saving || modified.length === 0}
              className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-black flex items-center gap-1.5 disabled:opacity-40"
            >
              {saving ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Salvataggio...</> : <><Save className="w-3.5 h-3.5" /> Salva listino</>}
            </button>
            {modified.length > 0 && (
              <span className="text-[11px] font-bold text-blue-700">
                {modified.length} {modified.length === 1 ? 'voce modificata' : 'voci modificate'} non ancora salvate
              </span>
            )}
            {updatedAt && (
              <span className="text-[10px] text-on-surface-variant/70 font-medium sm:ml-auto">
                ultimo salvataggio {new Date(updatedAt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// B. CACHE (api_cache)
// ═══════════════════════════════════════════════════════════════════════

/** Prefissi che si finisce sempre per digitare a mano: meglio a portata di tap. */
const CACHE_SHORTCUTS: Array<{ prefix: string; label: string }> = [
  { prefix: 'mostre_', label: 'Mostre' },
  { prefix: 'lib_item_', label: 'Libreria itinerari' },
  { prefix: 'evening_plan_', label: 'Piani serata' },
  { prefix: 'transit_', label: 'Scali e transiti' },
  { prefix: 'film_descriptors_', label: 'Set cinematografici' },
  // Contatori giornalieri dei teaser (20 POI a chiamata, 150/giorno a utente,
  // 6.000 globali): da qui si sblocca chi ha esaurito la quota senza colpa.
  { prefix: 'teaser_quota_', label: 'Quote teaser' },
];

const formatSize = (bytes: number) => {
  const b = Number(bytes) || 0;
  if (b >= 1048576) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1024).toFixed(1)} KB`;
};

function CacheSection() {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [prefix, setPrefix] = useState('');
  const [contentType, setContentType] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  const [okMsg, setOkMsg] = useState('');
  // Conferma FORTE della cancellazione per prefisso: si deve riscrivere il
  // prefisso a mano. Un purge per prefisso può cancellare migliaia di righe
  // (e settimane di generazioni AI pagate): un semplice OK non basta.
  const [purgePrefix, setPurgePrefix] = useState('');
  const [purgeConfirm, setPurgeConfirm] = useState('');

  const load = async (overridePrefix?: string) => {
    setLoading(true);
    setError('');
    setOkMsg('');
    const p = overridePrefix !== undefined ? overridePrefix : prefix;
    try {
      const qs = new URLSearchParams();
      if (p.trim()) qs.set('prefix', p.trim());
      if (contentType.trim()) qs.set('content_type', contentType.trim());
      qs.set('limit', '50');
      const res = await fetch(getApiUrl(`/api/admin/cache?${qs.toString()}`), { headers: await adminAuthHeaders() });
      if (res.status === 404) { setUnavailable(true); setLoading(false); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setUnavailable(false);
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setTotal(data?.total === undefined || data?.total === null ? null : Number(data.total));
      setSelected(new Set());
      setExpanded(null);
    } catch (e: any) {
      setError(`Lettura cache fallita: ${e?.message || e}`);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const purge = async (body: any, confirmText: string) => {
    if (!window.confirm(confirmText)) return;
    setPurging(true);
    setError('');
    setOkMsg('');
    try {
      const res = await fetch(getApiUrl('/api/admin/cache/purge'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await adminAuthHeaders()) },
        body: JSON.stringify(body),
      });
      if (res.status === 404) { setUnavailable(true); setPurging(false); return; }
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const n = Number(data?.deleted ?? data?.count ?? 0);
      setOkMsg(`Eliminate ${n} ${n === 1 ? 'riga' : 'righe'} dalla cache. I contenuti verranno rigenerati alla prossima richiesta (e ricosteranno chiamate AI).`);
      setPurgeConfirm('');
      setPurgePrefix('');
      await load();
    } catch (e: any) {
      setError(`Eliminazione fallita: ${e?.message || e}`);
    }
    setPurging(false);
  };

  const purgeSelected = () => {
    const keys = Array.from(selected);
    if (keys.length === 0) return;
    purge(
      { keys },
      `Stai per eliminare ${keys.length} ${keys.length === 1 ? 'voce' : 'voci'} di cache.\n\n` +
      keys.slice(0, 8).join('\n') + (keys.length > 8 ? `\n… e altre ${keys.length - 8}` : '') +
      '\n\nI contenuti andranno rigenerati (nuove chiamate AI a pagamento). Confermi?'
    );
  };

  const purgeByPrefix = () => {
    const p = purgePrefix.trim();
    if (p.length < 4) { setError('Il prefisso deve essere di almeno 4 caratteri: troppo corto si rischia di svuotare mezza cache.'); return; }
    if (purgeConfirm.trim() !== p) { setError('Per confermare riscrivi esattamente il prefisso nella casella di conferma.'); return; }
    purge(
      { prefix: p },
      `ELIMINAZIONE DI MASSA\n\nVerranno cancellate TUTTE le voci di cache che iniziano con "${p}".\n\n` +
      'Possono essere migliaia di righe, incluse generazioni AI già pagate. Non è reversibile. Confermi?'
    );
  };

  if (unavailable) {
    return (
      <div className="space-y-3">
        <NotYetAvailable what="Ispezione cache" routes={['GET /api/admin/cache', 'POST /api/admin/cache/purge']} />
        <button onClick={() => load()} className="px-3 py-1.5 rounded-xl bg-surface-variant border border-outline-variant text-primary text-[11px] font-black flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Controlla di nuovo
        </button>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-2xl p-4 border border-outline-variant space-y-3">
      <div className="flex items-start gap-2">
        <Database className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <h3 className="font-black text-primary text-sm">🗄️ Cache — ispezione e pulizia di api_cache</h3>
          <p className="text-[11px] text-on-surface-variant leading-snug">
            Qui dentro vivono itinerari della libreria, mostre, snapshot del canarino, feature flag e budget.
            Serve per <b>far rigenerare</b> un contenuto sbagliato: cancellare una riga costa una nuova chiamata AI.
          </p>
        </div>
      </div>

      {/* Filtri */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-on-surface-variant shrink-0" />
          <input
            value={prefix}
            onChange={e => setPrefix(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') load(); }}
            placeholder="Prefisso chiave (es. mostre_)"
            className="w-full px-2.5 py-1.5 rounded-lg border border-outline-variant bg-white text-xs font-medium text-primary"
          />
        </div>
        <input
          value={contentType}
          onChange={e => setContentType(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') load(); }}
          placeholder="Tipo (es. canary)"
          className="w-32 px-2.5 py-1.5 rounded-lg border border-outline-variant bg-white text-xs font-medium text-primary"
        />
        <button
          onClick={() => load()}
          disabled={loading}
          className="px-3 py-1.5 rounded-xl bg-primary text-white text-[11px] font-black flex items-center gap-1.5 disabled:opacity-40"
        >
          {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Cerca
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant">Scorciatoie:</span>
        {CACHE_SHORTCUTS.map(s => (
          <button
            key={s.prefix}
            onClick={() => { setPrefix(s.prefix); load(s.prefix); }}
            className="px-2 py-1 rounded-lg bg-surface-variant border border-outline-variant text-[10px] font-black text-primary hover:bg-outline-variant/40"
            title={s.prefix}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && <ErrorBar message={error} onRetry={() => load()} />}
      {okMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> {okMsg}
        </div>
      )}

      {loading ? (
        <div className="text-xs text-on-surface-variant italic">Lettura cache...</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-on-surface-variant italic">Nessuna voce trovata con questo filtro.</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
            <span className="text-on-surface-variant">
              {rows.length} {rows.length === 1 ? 'voce mostrata' : 'voci mostrate'}
              {total !== null && ` su ${total} totali`}
            </span>
            <button
              onClick={() => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map(r => r.cache_key)))}
              className="px-2 py-1 rounded-lg bg-surface-variant border border-outline-variant text-[10px] font-black text-primary"
            >
              {selected.size === rows.length ? 'Deseleziona tutto' : 'Seleziona tutte le visibili'}
            </button>
            <button
              onClick={purgeSelected}
              disabled={selected.size === 0 || purging}
              className="px-3 py-1 rounded-lg bg-red-600 text-white text-[10px] font-black flex items-center gap-1 disabled:opacity-30"
            >
              <Trash2 className="w-3 h-3" /> Elimina selezionate ({selected.size})
            </button>
          </div>

          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-xs min-w-[520px]">
              <thead>
                <tr className="text-[10px] font-black uppercase text-on-surface-variant border-b border-outline-variant">
                  <th className="w-8 py-1.5"></th>
                  <th className="text-left py-1.5 pr-2">Chiave</th>
                  <th className="text-left py-1.5 px-2">Tipo</th>
                  <th className="text-right py-1.5 px-2">Dim.</th>
                  <th className="text-right py-1.5 pl-2">Creata</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const key = String(r.cache_key);
                  const isOpen = expanded === key;
                  return (
                    <React.Fragment key={key}>
                      <tr className="border-b border-outline-variant/40 hover:bg-surface-variant/30">
                        <td className="py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={selected.has(key)}
                            onChange={() => toggle(key)}
                            aria-label={`Seleziona ${key}`}
                            className="w-3.5 h-3.5 accent-red-600"
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <button
                            onClick={() => setExpanded(isOpen ? null : key)}
                            className="font-mono font-bold text-primary text-[11px] text-left flex items-center gap-1 max-w-[240px]"
                            title={key}
                          >
                            {isOpen ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
                            <span className="truncate">{key}</span>
                          </button>
                        </td>
                        <td className="py-1.5 px-2">
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-surface-variant text-on-surface-variant">
                            {r.content_type || '—'}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-right font-bold text-on-surface-variant whitespace-nowrap">{formatSize(r.size)}</td>
                        <td className="py-1.5 pl-2 text-right text-[10px] font-medium text-on-surface-variant whitespace-nowrap">
                          {r.created_at ? new Date(r.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-outline-variant/40">
                          <td></td>
                          <td colSpan={4} className="py-2 pr-2">
                            <pre className="text-[10px] font-mono text-on-surface-variant bg-surface-variant/50 rounded-lg p-2 max-h-48 overflow-auto whitespace-pre-wrap break-words">
                              {String(r.preview ?? '(nessuna anteprima)')}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Eliminazione di massa per prefisso — la parte pericolosa */}
      <div className="rounded-xl border border-red-200 bg-red-50/60 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
          <span className="text-xs font-black text-red-700">Elimina per prefisso (irreversibile)</span>
        </div>
        <p className="text-[11px] font-medium text-red-800/80 leading-snug">
          Cancella <b>tutte</b> le voci che iniziano col prefisso indicato, anche quelle non elencate qui sopra.
          Minimo 4 caratteri, e va riscritto identico per confermare.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={purgePrefix}
            onChange={e => { setPurgePrefix(e.target.value); setPurgeConfirm(''); }}
            placeholder="Prefisso da eliminare"
            className="flex-1 min-w-[150px] px-2.5 py-1.5 rounded-lg border border-red-300 bg-white text-xs font-mono font-bold text-red-800"
          />
          <input
            value={purgeConfirm}
            onChange={e => setPurgeConfirm(e.target.value)}
            placeholder="Riscrivi per confermare"
            className="flex-1 min-w-[150px] px-2.5 py-1.5 rounded-lg border border-red-300 bg-white text-xs font-mono font-bold text-red-800"
          />
          <button
            onClick={purgeByPrefix}
            disabled={purging || purgePrefix.trim().length < 4 || purgeConfirm.trim() !== purgePrefix.trim()}
            className="px-3 py-1.5 rounded-xl bg-red-600 text-white text-[11px] font-black flex items-center gap-1.5 disabled:opacity-30"
          >
            {purging ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Elimina per prefisso
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// C. SALUTE E CANARINO
// ═══════════════════════════════════════════════════════════════════════

/**
 * /api/admin/health-checks esiste nel server da tempo ma nessuna UI lo ha
 * mai chiamato: sono ping REALI ai servizi esterni (non la sola presenza
 * delle chiavi come /api/admin/diagnostics). Qui finalmente si lancia a mano.
 * Il canarino invece ha già il semaforo in Diagnostica: non lo si duplica,
 * si aggiunge solo lo storico in tabella, che lì è ridotto a pallini.
 */
function HealthSection() {
  const [checks, setChecks] = useState<any[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [ranAt, setRanAt] = useState<Date | null>(null);

  const [history, setHistory] = useState<any[]>([]);
  const [histLoading, setHistLoading] = useState(true);
  const [histError, setHistError] = useState('');
  const [canaryRunning, setCanaryRunning] = useState(false);

  const runChecks = async () => {
    setRunning(true);
    setError('');
    try {
      const res = await fetch(getApiUrl('/api/admin/health-checks'), { headers: await adminAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setChecks(Array.isArray(data?.checks) ? data.checks : []);
      setRanAt(new Date());
    } catch (e: any) {
      setError(`Controlli non eseguiti: ${e?.message || e}`);
    }
    setRunning(false);
  };

  const loadHistory = async () => {
    setHistLoading(true);
    setHistError('');
    try {
      const res = await fetch(getApiUrl('/api/admin/canary/status'), { headers: await adminAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHistory(Array.isArray(data?.history) ? data.history : []);
    } catch (e: any) {
      setHistError(`Storico canarino non caricato: ${e?.message || e}`);
    }
    setHistLoading(false);
  };

  useEffect(() => { loadHistory(); }, []);

  // Il canarino salva lo snapshot e alimenta lo storico: dopo il run si
  // ricarica la tabella invece di indovinare il risultato lato client.
  const runCanary = async () => {
    setCanaryRunning(true);
    setHistError('');
    try {
      const res = await fetch(getApiUrl('/api/canary/run'), { headers: await adminAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const snap = await res.json();
      setChecks(Array.isArray(snap?.checks) ? snap.checks : null);
      setRanAt(new Date());
      await loadHistory();
    } catch (e: any) {
      setHistError(`Canarino non partito: ${e?.message || e}`);
    }
    setCanaryRunning(false);
  };

  const failed = (checks || []).filter((c: any) => !c.ok);
  const green = (checks || []).length - failed.length;

  return (
    <div className="space-y-3">
      <div className="bg-surface rounded-2xl p-4 border border-outline-variant space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <HeartPulse className={`w-5 h-5 shrink-0 mt-0.5 ${!checks ? 'text-gray-400' : failed.length === 0 ? 'text-emerald-500' : 'text-red-500'}`} />
            <div>
              <h3 className="font-black text-primary text-sm">🩺 Health check — ping reali ai servizi</h3>
              <p className="text-[11px] text-on-surface-variant leading-snug">
                Non controlla se la chiave è configurata: <b>chiama davvero</b> Supabase, Groq, Azure, Stripe,
                Mapbox e gli altri, con 5 secondi di timeout ciascuno. Un giro dura una decina di secondi.
              </p>
            </div>
          </div>
          <button
            onClick={runChecks}
            disabled={running}
            className="self-start px-4 py-2 rounded-xl bg-primary text-white text-xs font-black flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
          >
            {running ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Sto pingando...</> : <><Play className="w-3.5 h-3.5" /> Esegui i controlli</>}
          </button>
        </div>

        {error && <ErrorBar message={error} onRetry={runChecks} />}

        {!checks ? (
          <div className="text-xs text-on-surface-variant italic">
            {running ? 'Controlli in corso...' : 'Nessun controllo eseguito in questa sessione: premi "Esegui i controlli".'}
          </div>
        ) : (
          <>
            <div className={`rounded-xl px-3 py-2 text-xs font-black flex flex-wrap items-center gap-2 ${
              failed.length === 0 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
            }`} aria-live="polite">
              {failed.length === 0 ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
              {green}/{checks.length} servizi verdi
              {ranAt && (
                <span className="font-medium text-[11px] opacity-70">
                  — {ranAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
              {checks.map((c: any, i: number) => (
                <div
                  key={`${c.name}_${i}`}
                  className={`rounded-xl border px-2.5 py-2 flex items-start gap-2 ${c.ok ? 'bg-emerald-50/60 border-emerald-200' : 'bg-red-50 border-red-200'}`}
                >
                  {c.ok
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    : <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-black text-primary">{c.name}</div>
                    <div className={`text-[10px] font-medium break-words ${c.ok ? 'text-on-surface-variant' : 'text-red-700 font-bold'}`}>{c.note}</div>
                  </div>
                  <span className={`text-[10px] font-black whitespace-nowrap ${Number(c.ms) > 3000 ? 'text-amber-600' : 'text-on-surface-variant/70'}`}>
                    {Number(c.ms) || 0} ms
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Canarino: qui SOLO lo storico in tabella (in Diagnostica ci sono i
          pallini e l'ultimo esito) + il lancio manuale, che riscrive lo
          snapshot e apre un errore critico sui check passati al rosso. */}
      <div className="bg-surface rounded-2xl p-4 border border-outline-variant space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <Bird className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-black text-primary text-sm">🐦 Canarino — storico dei run</h3>
              <p className="text-[11px] text-on-surface-variant leading-snug">
                Gli stessi controlli, eseguiti dal cron ogni mattina alle 07:00. Il semaforo dell'ultimo run
                è nella scheda <b>Diagnostica</b>: qui c'è lo storico esteso, per capire da quando un servizio zoppica.
              </p>
            </div>
          </div>
          <button
            onClick={runCanary}
            disabled={canaryRunning}
            className="self-start px-3 py-2 rounded-xl bg-surface-variant border border-outline-variant text-primary text-[11px] font-black flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
            title="Esegue i controlli E salva lo snapshot come run ufficiale del canarino"
          >
            {canaryRunning ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> In volo...</> : <><Play className="w-3.5 h-3.5" /> Lancia il canarino</>}
          </button>
        </div>

        {histError && <ErrorBar message={histError} onRetry={loadHistory} />}

        {histLoading ? (
          <div className="text-xs text-on-surface-variant italic">Caricamento storico...</div>
        ) : history.length === 0 ? (
          <div className="text-xs text-on-surface-variant italic">Nessun run registrato: il primo arriva col cron di domattina.</div>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-xs min-w-[420px]">
              <thead>
                <tr className="text-[10px] font-black uppercase text-on-surface-variant border-b border-outline-variant">
                  <th className="text-left py-1.5 pr-2">Quando</th>
                  <th className="text-left py-1.5 px-2">Esito</th>
                  <th className="text-left py-1.5 pl-2">Servizi al rosso</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 30).map((h: any, i: number) => (
                  <tr key={`${h.ranAt}_${i}`} className="border-b border-outline-variant/40">
                    <td className="py-1.5 pr-2 font-bold text-primary whitespace-nowrap text-[11px]">
                      {h.ranAt ? new Date(h.ranAt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="py-1.5 px-2">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${h.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {h.ok ? 'TUTTO VERDE' : `${h.failedCount || 0} ROSSI`}
                      </span>
                    </td>
                    <td className="py-1.5 pl-2 text-[10px] font-medium text-red-700 break-words">
                      {(h.failedNames || []).join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// D. BUDGET AI
// ═══════════════════════════════════════════════════════════════════════

/**
 * Il dettaglio per feature/giorno vive nella scheda "API e costi": qui si
 * tiene solo il riepilogo e — il vero valore aggiunto — un ALLARME che si
 * vede da lontano quando la spesa del mese supera il 70% o il 90% del tetto.
 * Il canarino notturno scrive un errore critico solo a sforamento avvenuto:
 * troppo tardi per reagire.
 */
function BudgetSection() {
  const [monthCost, setMonthCost] = useState<number | null>(null);
  const [budget, setBudget] = useState(0);
  const [input, setInput] = useState('');
  const [byFeature, setByFeature] = useState<Record<string, any>>({});
  const [byDay, setByDay] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(getApiUrl('/api/admin/ai-costs?days=31'), { headers: await adminAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMonthCost(Number(data?.monthCost) || 0);
      setBudget(Number(data?.monthlyBudgetUsd) || 0);
      setInput(data?.monthlyBudgetUsd ? String(data.monthlyBudgetUsd) : '');
      setByFeature(data?.byFeature && typeof data.byFeature === 'object' ? data.byFeature : {});
      setByDay(data?.byDay && typeof data.byDay === 'object' ? data.byDay : {});
    } catch (e: any) {
      setError(`Costi non caricati: ${e?.message || e}`);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const saveBudget = async () => {
    const n = Number(input);
    if (!Number.isFinite(n) || n < 0) { setError('Il tetto mensile deve essere un numero positivo (in dollari).'); return; }
    if (!window.confirm(`Imposti il tetto mensile di spesa AI a $${n.toFixed(2)}?\n\nSuperata questa soglia il canarino apre un errore critico ogni mattina.`)) return;
    setSaving(true);
    setError('');
    setOkMsg('');
    try {
      const res = await fetch(getApiUrl('/api/admin/ai-budget'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await adminAuthHeaders()) },
        body: JSON.stringify({ monthlyBudgetUsd: n }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setBudget(Number(data?.monthlyBudgetUsd) || 0);
      setOkMsg('Tetto mensile aggiornato.');
    } catch (e: any) {
      setError(`Salvataggio budget fallito: ${e?.message || e}`);
    }
    setSaving(false);
  };

  const spent = monthCost ?? 0;
  const pct = budget > 0 ? (spent / budget) * 100 : 0;
  const band: 'ok' | 'warn' | 'alert' | 'over' =
    budget <= 0 ? 'ok' : pct >= 100 ? 'over' : pct >= 90 ? 'alert' : pct >= 70 ? 'warn' : 'ok';

  const topFeatures = Object.entries(byFeature)
    .map(([k, v]: any) => ({ key: k, cost: Number(v?.cost) || 0, calls: Number(v?.calls) || 0 }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 6);

  const lastDays = Object.entries(byDay)
    .map(([d, v]: any) => ({ day: d, cost: Number(v?.cost) || 0, calls: Number(v?.calls) || 0 }))
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .slice(0, 7);

  const maxDayCost = Math.max(0.0001, ...lastDays.map(d => d.cost));

  return (
    <div className="bg-surface rounded-2xl p-4 border border-outline-variant space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <PiggyBank className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <h3 className="font-black text-primary text-sm">🐷 Budget AI — tetto mensile e allarme</h3>
            <p className="text-[11px] text-on-surface-variant leading-snug">
              Riepilogo compatto della spesa: il dettaglio per funzione, utente e log grezzi è nella scheda
              <b> API e costi</b>. Qui conta l'allarme prima dello sforamento.
            </p>
          </div>
        </div>
        <button onClick={load} disabled={loading} className="self-start p-1.5 rounded-lg text-on-surface-variant hover:text-blue-600 disabled:opacity-40" title="Ricarica">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && <ErrorBar message={error} onRetry={load} />}
      {okMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> {okMsg}
        </div>
      )}

      {loading ? (
        <div className="text-xs text-on-surface-variant italic">Caricamento costi...</div>
      ) : (
        <>
          {/* ALLARME: la ragione d'essere di questa sezione */}
          {band !== 'ok' && (
            <div
              className={`rounded-xl px-3 py-2.5 border flex items-start gap-2 ${
                band === 'over' ? 'bg-red-50 border-red-300 text-red-800'
                  : band === 'alert' ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
              aria-live="polite"
            >
              <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${band === 'warn' ? 'text-amber-600' : 'text-red-600'}`} />
              <div>
                <div className="text-xs font-black">
                  {band === 'over'
                    ? `BUDGET SFORATO — $${spent.toFixed(2)} su $${budget.toFixed(2)}`
                    : band === 'alert'
                      ? `Spesa al ${pct.toFixed(0)}% del budget mensile`
                      : `Spesa oltre il 70% del budget mensile (${pct.toFixed(0)}%)`}
                </div>
                <div className="text-[11px] font-medium opacity-80 leading-snug">
                  {band === 'over'
                    ? 'Ogni chiamata in più è fuori budget: valuta di spegnere le funzioni AI più costose dai feature flag (scheda Diagnostica).'
                    : 'Se il ritmo resta questo il tetto salta prima di fine mese. Controlla le funzioni in cima alla classifica qui sotto.'}
                </div>
              </div>
            </div>
          )}

          {/* Barra di consumo + impostazione del tetto */}
          <div className="rounded-xl border border-outline-variant bg-surface-variant/40 p-3 space-y-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-black text-primary">${spent.toFixed(2)}</span>
              <span className="text-[11px] font-bold text-on-surface-variant">
                spesi questo mese{budget > 0 ? ` su un tetto di $${budget.toFixed(2)}` : ' — nessun tetto impostato'}
              </span>
            </div>
            {budget > 0 && (
              <div className="h-2.5 w-full rounded-full bg-outline-variant/40 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    band === 'ok' ? 'bg-emerald-500' : band === 'warn' ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <label className="text-[11px] font-black text-on-surface-variant">Tetto mensile ($)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="0 = nessun tetto"
                className="w-28 px-2.5 py-1.5 rounded-lg border border-outline-variant bg-white text-xs font-black text-primary text-right"
              />
              <button
                onClick={saveBudget}
                disabled={saving}
                className="px-3 py-1.5 rounded-xl bg-primary text-white text-[11px] font-black flex items-center gap-1.5 disabled:opacity-40"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salva tetto
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Top funzioni per costo */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Funzioni più costose (31 gg)</p>
              {topFeatures.length === 0 ? (
                <div className="text-[11px] text-on-surface-variant italic">Nessun costo tracciato nel periodo.</div>
              ) : topFeatures.map(f => (
                <div key={f.key} className="flex items-center justify-between gap-2 text-[11px] border-b border-outline-variant/40 py-1">
                  <span className="font-bold text-primary truncate" title={f.key}>{f.key}</span>
                  <span className="whitespace-nowrap font-medium text-on-surface-variant">
                    {f.calls} ch. · <b className="text-primary">${f.cost.toFixed(2)}</b>
                  </span>
                </div>
              ))}
            </div>

            {/* Ultimi 7 giorni */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Ultimi 7 giorni</p>
              {lastDays.length === 0 ? (
                <div className="text-[11px] text-on-surface-variant italic">Nessun log nel periodo.</div>
              ) : lastDays.map(d => (
                <div key={d.day} className="flex items-center gap-2 text-[11px]">
                  <span className="w-14 shrink-0 font-bold text-on-surface-variant">
                    {d.day.slice(8)}/{d.day.slice(5, 7)}
                  </span>
                  <span className="flex-1 h-2 rounded-full bg-outline-variant/30 overflow-hidden">
                    <span className="block h-full rounded-full bg-blue-500" style={{ width: `${(d.cost / maxDayCost) * 100}%` }} />
                  </span>
                  <span className="w-16 text-right font-black text-primary">${d.cost.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// CONSOLE
// ═══════════════════════════════════════════════════════════════════════

type OpsTab = 'pricing' | 'cache' | 'health' | 'budget';

const OPS_TABS: Array<{ id: OpsTab; label: string; icon: React.ReactNode }> = [
  { id: 'pricing', label: 'Listino crediti', icon: <Coins className="w-4 h-4" /> },
  { id: 'cache', label: 'Cache', icon: <Database className="w-4 h-4" /> },
  { id: 'health', label: 'Salute e canarino', icon: <HeartPulse className="w-4 h-4" /> },
  { id: 'budget', label: 'Budget AI', icon: <PiggyBank className="w-4 h-4" /> },
];

export default function AdminOpsConsole() {
  const [tab, setTab] = useState<OpsTab>('pricing');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-black text-primary flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-secondary" />
          Console di governo
        </h2>
        <p className="text-sm text-on-surface-variant font-medium mt-1">
          Le leve che finora richiedevano un deploy: prezzi, cache, salute dei servizi e tetto di spesa AI.
        </p>
      </div>

      {/* Sotto-schede a pillole: scorrono su schermo stretto, come le tab del pannello */}
      <div className="overflow-x-auto no-scrollbar" data-swipe-ignore="true">
        <div className="flex flex-nowrap sm:flex-wrap bg-[#f8f5f0] p-1 rounded-2xl gap-1 min-w-max sm:min-w-full">
          {OPS_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 min-w-[130px] py-2.5 px-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                tab === t.id ? 'bg-white text-primary shadow-sm' : 'text-primary/60 hover:text-primary'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'pricing' && <PricingSection />}
      {tab === 'cache' && <CacheSection />}
      {tab === 'health' && <HealthSection />}
      {tab === 'budget' && <BudgetSection />}
    </div>
  );
}
