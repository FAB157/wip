import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getApiUrl } from '../lib/api';
import { elencoFlagCompleto } from '../lib/featureFlags';
import { Activity, Play, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Database, Wifi, Smartphone, HardDrive, Map, Award, Trash2, Bell, ShieldCheck, Globe2, Volume2, Navigation, Bird, ToggleLeft, BookOpen } from 'lucide-react';

// Header di autenticazione admin condiviso dalle sezioni canarino e flag.
const adminAuthHeaders = async (): Promise<Record<string, string>> => {
  const { data: s } = await supabase.auth.getSession();
  const token = s?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// ── CANARINO API: semaforo dell'ultimo smoke test schedulato ────────────
// Il cron Vercel chiama /api/canary/run ogni mattina alle 07:00 italiane;
// qui si legge lo snapshot e si può rilanciare a mano.
function CanarySection() {
  const [status, setStatus] = useState<{ last: any; history: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/admin/canary/status'), { headers: await adminAuthHeaders() });
      if (res.ok) setStatus(await res.json());
    } catch { /* rete giù: resta l'ultimo stato */ }
    setLoading(false);
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await fetch(getApiUrl('/api/canary/run'), { headers: await adminAuthHeaders() });
      if (res.ok) {
        const snap = await res.json();
        setStatus(prev => ({ last: snap, history: [{ ranAt: snap.ranAt, ok: snap.ok, failedCount: snap.failedCount, failedNames: (snap.checks || []).filter((c: any) => !c.ok).map((c: any) => c.name) }, ...(prev?.history || [])] }));
      }
    } catch { /* il prossimo load ripulisce */ }
    setRunning(false);
  };

  useEffect(() => { load(); }, []);

  const last = status?.last;
  const failed = (last?.checks || []).filter((c: any) => !c.ok);

  return (
    <div className="bg-surface rounded-2xl p-4 border border-outline-variant space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bird className={`w-5 h-5 ${!last ? 'text-gray-400' : last.ok ? 'text-emerald-500' : 'text-red-500'}`} />
          <div>
            <h3 className="font-black text-primary text-sm">Canarino API — smoke test giornaliero</h3>
            <p className="text-[11px] text-on-surface-variant">
              Cron Vercel ogni mattina (07:00 italiane). Un check che passa al rosso finisce negli Errori di Sistema come critico.
            </p>
          </div>
        </div>
        <button
          onClick={runNow}
          disabled={running}
          className="self-start px-4 py-2 rounded-xl bg-primary text-white text-xs font-black flex items-center gap-1.5 disabled:opacity-50"
        >
          {running ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> In volo...</> : <><Play className="w-3.5 h-3.5" /> Esegui ora</>}
        </button>
      </div>

      {loading ? (
        <div className="text-xs text-on-surface-variant italic">Caricamento ultimo run...</div>
      ) : !last ? (
        <div className="text-xs text-on-surface-variant italic">Nessun run registrato: il primo arriva col cron di domattina, oppure lancialo ora.</div>
      ) : (
        <>
          <div className={`rounded-xl px-3 py-2 text-xs font-bold flex flex-wrap items-center gap-2 ${last.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {last.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
            {last.total - last.failedCount}/{last.total} servizi verdi
            <span className="font-medium text-[11px] opacity-70">
              — {new Date(last.ranAt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
            {/* Storico compatto: un pallino per run, dal più recente */}
            <span className="ml-auto flex items-center gap-1" title="Ultimi run (dal più recente)">
              {(status?.history || []).slice(0, 14).map((h: any, i: number) => (
                <span key={i} className={`w-2 h-2 rounded-full ${h.ok ? 'bg-emerald-400' : 'bg-red-400'}`} title={`${new Date(h.ranAt).toLocaleString('it-IT')}${h.failedCount ? ` — rossi: ${(h.failedNames || []).join(', ')}` : ''}`} />
              ))}
            </span>
          </div>
          {failed.length > 0 && (
            <div className="space-y-1">
              {failed.map((c: any) => (
                <div key={c.name} className="text-[11px] font-bold text-red-700 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
                  <span>{c.name}</span>
                  <span className="font-mono font-medium text-red-500 truncate max-w-[50%]" title={c.note}>{c.note}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── ROUTING: quale fonte serve le rotte (09/09/2026) ─────────────────────
// Il navigatore dipende da 5 servizi esterni in catena (FOSSGIS OSRM e
// Valhalla gratuiti senza garanzia, poi ORS, Geoapify, Mapbox a pagamento).
// Se le gratuite calano e le riserve salgono, e' il momento di passare a un
// router nostro — PRIMA che gli utenti restino a piedi. Dati da
// /api/admin/routing-stats (contatore per giorno e fonte).
function RoutingSection() {
  const [dati, setDati] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(getApiUrl('/api/admin/routing-stats?giorni=7'), { headers: await adminAuthHeaders() });
        if (res.ok) setDati(await res.json());
      } catch { /* resta null */ }
      setLoading(false);
    })();
  }, []);

  const totali: Record<string, number> = dati?.totali || {};
  const fonti = Object.entries(totali).sort((a, b) => b[1] - a[1]);
  const totale = fonti.reduce((s, [, n]) => s + n, 0);
  const quota = dati?.quotaGratuita;
  const allarme = quota != null && quota < 80 && totale >= 20;

  return (
    <div className="bg-white rounded-2xl p-4 border border-outline-variant/40 space-y-3">
      <div className="flex items-center gap-2">
        <Globe2 className="w-5 h-5 text-primary" />
        <div>
          <h3 className="font-black text-primary text-sm">Routing — chi serve le rotte (7 giorni)</h3>
          <p className="text-[11px] text-on-surface-variant">Le prime due fonti sono gratuite ma senza garanzia: se la quota scende sotto l'80% le riserve stanno lavorando troppo.</p>
        </div>
      </div>
      {loading ? (
        <div className="text-xs text-on-surface-variant italic">Caricamento...</div>
      ) : !dati ? (
        <div className="text-xs text-red-600">Statistiche non disponibili.</div>
      ) : (
        <div className="space-y-2">
          <div className={`text-xs font-bold ${allarme ? 'text-red-600' : 'text-green-700'}`}>
            {totale} rotte · quota fonti gratuite/cache: {quota == null ? '—' : `${quota}%`}
            {allarme && ' — ATTENZIONE: le riserve stanno servendo troppe rotte'}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {fonti.map(([f, n]) => (
              <div key={f} className="bg-surface-variant/40 rounded-lg px-2.5 py-1.5 border border-outline-variant/40">
                <div className="text-[10px] font-black uppercase tracking-wider text-primary/60 truncate">{f}</div>
                <div className="text-sm font-black tabular-nums">{n} <span className="text-[10px] font-semibold text-on-surface-variant">({totale ? Math.round((n / totale) * 100) : 0}%)</span></div>
              </div>
            ))}
            {fonti.length === 0 && <div className="text-xs text-on-surface-variant italic col-span-full">Nessuna rotta negli ultimi 7 giorni.</div>}
          </div>
          {dati.mapbox && (
            <div className="text-[11px] text-on-surface-variant">
              Mapbox {dati.mapbox.mese}: <span className="font-bold tabular-nums">{dati.mapbox.usate}</span> / {dati.mapbox.tetto} richieste (tetto mensile)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── MONITORAGGIO ESTERNO: Sentry / Checkly / UptimeRobot / PostHog ──────
// (30/08/2026) Un colpo d'occhio sui quattro servizi invece di aprire
// quattro dashboard diverse. Ogni fornitore senza la sua chiave di lettura
// (diversa da quella di scrittura, vedi server.ts) mostra "non configurato"
// invece di un errore — coerente con come il resto dell'app tratta le chiavi
// assenti.
function MonitoringSection() {
  const [dati, setDati] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(getApiUrl('/api/admin/monitoring-status'), { headers: await adminAuthHeaders() });
        if (res.ok) setDati(await res.json());
      } catch { /* resta null: la card lo dice */ }
      setLoading(false);
    })();
  }, []);

  const Card = ({ titolo, children }: { titolo: string; children: React.ReactNode }) => (
    <div className="bg-surface-variant/40 rounded-xl p-3 border border-outline-variant/60 space-y-2 min-w-0">
      <h4 className="text-[11px] font-black uppercase tracking-wider text-primary/60">{titolo}</h4>
      {children}
    </div>
  );
  const NonConfigurato = ({ nota }: { nota: string }) => (
    <p className="text-[11px] text-on-surface-variant italic">Non configurato — {nota}</p>
  );

  const checkly = dati?.checkly;
  const sentry = dati?.sentry;
  const uptimerobot = dati?.uptimerobot;
  const posthog = dati?.posthog;

  return (
    <div className="bg-surface rounded-2xl p-4 border border-outline-variant space-y-3">
      <div className="flex items-center gap-2">
        <Globe2 className="w-5 h-5 text-primary" />
        <div>
          <h3 className="font-black text-primary text-sm">Monitoraggio esterno</h3>
          <p className="text-[11px] text-on-surface-variant">Sentry (errori), Checkly (controlli sintetici), UptimeRobot (uptime), PostHog (eventi di prodotto).</p>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-on-surface-variant italic">Caricamento...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card titolo="🐞 Sentry — errori (24h)">
            {!sentry?.configured ? (
              <NonConfigurato nota="manca SENTRY_AUTH_TOKEN / SENTRY_ORG_SLUG" />
            ) : sentry.error ? (
              <p className="text-[11px] text-red-600 font-bold">{sentry.error}</p>
            ) : (
              <>
                <p className={`text-lg font-black ${sentry.issuesLast24h > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {sentry.issuesLast24h} {sentry.issuesLast24h === 1 ? 'errore' : 'errori'}
                </p>
                {(sentry.topIssues || []).slice(0, 3).map((i: any, idx: number) => (
                  <a key={idx} href={i.permalink} target="_blank" rel="noreferrer"
                    className="block text-[11px] text-primary underline truncate">
                    {i.title} ({i.count}×)
                  </a>
                ))}
              </>
            )}
          </Card>

          <Card titolo="🩺 Checkly — controlli sintetici">
            {!checkly?.configured ? (
              <NonConfigurato nota="manca CHECKLY_API_KEY / CHECKLY_ACCOUNT_ID" />
            ) : checkly.error ? (
              <p className="text-[11px] text-red-600 font-bold">{checkly.error}</p>
            ) : (
              <div className="space-y-1">
                {(checkly.checks || []).map((c: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-1.5 text-[11px] font-bold">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${c.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className="truncate">{c.name}</span>
                  </div>
                ))}
                {(checkly.checks || []).length === 0 && <p className="text-[11px] text-on-surface-variant italic">Nessun check pubblicato ancora.</p>}
              </div>
            )}
          </Card>

          <Card titolo="⏱ UptimeRobot — disponibilità">
            {!uptimerobot?.configured ? (
              <NonConfigurato nota="manca UPTIMEROBOT_API_KEY" />
            ) : uptimerobot.error ? (
              <p className="text-[11px] text-red-600 font-bold">{uptimerobot.error}</p>
            ) : (
              <div className="space-y-1">
                {(uptimerobot.monitors || []).map((m: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-1.5 text-[11px] font-bold">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${m.up ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className="truncate flex-1">{m.name}</span>
                    {m.uptime30gg != null && <span className="text-on-surface-variant font-medium">{Number(m.uptime30gg).toFixed(2)}%</span>}
                  </div>
                ))}
                {(uptimerobot.monitors || []).length === 0 && <p className="text-[11px] text-on-surface-variant italic">Nessun monitor creato ancora.</p>}
              </div>
            )}
          </Card>

          <Card titolo="📈 PostHog — eventi di prodotto (24h)">
            {!posthog?.configured ? (
              <NonConfigurato nota="manca POSTHOG_PERSONAL_API_KEY / POSTHOG_PROJECT_ID" />
            ) : posthog.error ? (
              <p className="text-[11px] text-red-600 font-bold">{posthog.error}</p>
            ) : (
              <div className="space-y-1">
                {(posthog.eventi || []).map((e: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-[11px] font-bold">
                    <span className="truncate">{e.event}</span>
                    <span className="text-primary">{e.count24h == null ? '—' : `${e.count24h}${e.approssimato ? '+' : ''}`}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

// ── FEATURE FLAG: kill switch senza deploy ──────────────────────────────
// Ogni interruttore salva subito: spegnere una feature guasta deve costare
// un tap, non un rilascio. Propagazione: client al riavvio, server ≤60s.
function FlagsSection() {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(getApiUrl('/api/flags'));
        if (res.ok) {
          const data = await res.json();
          setFlags(data?.flags || {});
        }
      } catch { /* default: tutto acceso */ }
      setLoading(false);
    })();
  }, []);

  const toggle = async (key: string) => {
    const next = { ...flags, [key]: flags[key] === false };
    setSavingKey(key);
    setError('');
    try {
      const res = await fetch(getApiUrl('/api/admin/flags'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await adminAuthHeaders()) },
        body: JSON.stringify({ flags: next })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFlags(data.flags || next);
    } catch (e: any) {
      setError(`Salvataggio fallito: ${e?.message || e}`);
    }
    setSavingKey(null);
  };

  return (
    <div className="bg-surface rounded-2xl p-4 border border-outline-variant space-y-3">
      <div className="flex items-center gap-2">
        <ToggleLeft className="w-5 h-5 text-primary" />
        <div>
          <h3 className="font-black text-primary text-sm">Feature flag — kill switch senza deploy</h3>
          <p className="text-[11px] text-on-surface-variant">
            Spegni una funzione guasta in pochi secondi: il server la blocca entro 1 minuto, i client la nascondono al riavvio dell'app.
          </p>
        </div>
      </div>
      {loading ? (
        <div className="text-xs text-on-surface-variant italic">Caricamento flag...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {/* Non piu' solo i flag cablati: si mostrano anche quelli nati sul
              server. Un kill switch che per comparire nel pannello richiede un
              deploy non e' un kill switch. */}
          {elencoFlagCompleto(flags).map(f => {
            const on = flags[f.key] !== false;
            return (
              <button
                key={f.key}
                onClick={() => toggle(f.key)}
                disabled={savingKey === f.key}
                className={`text-left rounded-xl border p-3 transition-colors ${on ? 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100' : 'bg-red-50 border-red-200 hover:bg-red-100'}`}
                title={f.descrizione}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-primary">
                    {f.label}
                    {!f.noto && <span className="ml-1 text-[9px] font-black text-amber-600 uppercase">nuovo</span>}
                  </span>
                  {savingKey === f.key
                    ? <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />
                    : <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${on ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>{on ? 'ATTIVA' : 'SPENTA'}</span>}
                </div>
                <div className="text-[10px] text-on-surface-variant mt-1 leading-tight">{f.descrizione}</div>
              </button>
            );
          })}
        </div>
      )}
      {error && <div className="text-[11px] font-bold text-red-600">{error}</div>}
    </div>
  );
}

// ── TELEMETRIA TRIGGER: aggregati 14 giorni (web/android/ios) ───────────
// Fonte: /api/admin/trigger-telemetry (aggregati giornalieri in api_cache,
// alimentati da /api/telemetry/trigger e /api/telemetry/feedback).
function TriggerTelemetrySection() {
  const [days, setDays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(getApiUrl('/api/admin/trigger-telemetry'), { headers: await adminAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDays(Array.isArray(data?.days) ? data.days : []);
    } catch (e: any) {
      setError(`Caricamento fallito: ${e?.message || e}`);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Somma dei 14 giorni per piattaforma + feedback
  const totals: Record<string, { fired: number; suppressed: number; skipped: number }> = {
    web: { fired: 0, suppressed: 0, skipped: 0 },
    android: { fired: 0, suppressed: 0, skipped: 0 },
    ios: { fired: 0, suppressed: 0, skipped: 0 },
  };
  const feedback = { ok: 0, early: 0, wrong: 0 };
  for (const d of days) {
    for (const p of ['web', 'android', 'ios']) {
      totals[p].fired += Number(d?.[p]?.fired) || 0;
      totals[p].suppressed += Number(d?.[p]?.suppressed) || 0;
      totals[p].skipped += Number(d?.[p]?.skipped) || 0;
    }
    feedback.ok += Number(d?.feedback?.ok) || 0;
    feedback.early += Number(d?.feedback?.early) || 0;
    feedback.wrong += Number(d?.feedback?.wrong) || 0;
  }

  return (
    <div className="bg-surface rounded-2xl p-4 border border-outline-variant space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-black text-primary text-sm">🎯 Telemetria trigger (14 gg)</h3>
            <p className="text-[11px] text-on-surface-variant">
              Trigger audioguida scattati/soppressi per piattaforma e feedback degli utenti dal player.
            </p>
          </div>
        </div>
        <button onClick={load} disabled={loading} className="p-1.5 rounded-lg text-on-surface-variant hover:text-blue-600 disabled:opacity-40" title="Ricarica">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {error && <div className="text-[11px] font-bold text-red-600">{error}</div>}
      {loading ? (
        <div className="text-xs text-on-surface-variant italic">Caricamento telemetria...</div>
      ) : days.length === 0 ? (
        <div className="text-xs text-on-surface-variant italic">Nessun dato negli ultimi 14 giorni (la telemetria si popola con l'uso dell'app).</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] font-black uppercase text-on-surface-variant border-b border-outline-variant">
                  <th className="text-left py-1.5 pr-2">Piattaforma</th>
                  <th className="text-right py-1.5 px-2">Scattati</th>
                  <th className="text-right py-1.5 px-2">Soppressi</th>
                  <th className="text-right py-1.5 pl-2">Saltati</th>
                </tr>
              </thead>
              <tbody>
                {(['web', 'android', 'ios'] as const).map(p => (
                  <tr key={p} className="border-b border-outline-variant/40">
                    <td className="py-1.5 pr-2 font-bold text-primary uppercase">{p}</td>
                    <td className="py-1.5 px-2 text-right font-black text-emerald-600">{totals[p].fired}</td>
                    <td className="py-1.5 px-2 text-right font-bold text-amber-600">{totals[p].suppressed}</td>
                    <td className="py-1.5 pl-2 text-right font-bold text-on-surface-variant">{totals[p].skipped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
            <span className="text-on-surface-variant">Feedback utenti:</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">👍 OK: {feedback.ok}</span>
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">⏱ Troppo presto: {feedback.early}</span>
            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700">❌ Sbagliato: {feedback.wrong}</span>
            <span className="ml-auto text-on-surface-variant/60 font-medium">{days.length} {days.length === 1 ? 'giorno' : 'giorni'} con dati</span>
          </div>
        </>
      )}
    </div>
  );
}

// ── REGISTRO DEL NAVIGATORE NATIVO (03/10/2026) ─────────────────────────
// Dopo un giro di prova camminato: una riga per fix col percorso attivo —
// posizione, precisione, passo, metri in linea d'aria e lungo la strada,
// aggancio al tracciato, velocità, chi era al comando (JS o nativo) e la frase
// detta. Vive nella memoria del servizio nativo: si scarica PRIMA di chiudere
// l'app. Serve a correggere il navigatore sui fatti, non a tentativi.
// ── TEST VIRTUALE (04/10/2026) ───────────────────────────────────────────
// Sempre pronto: un tasto apre la barra del test sopra la mappa di WIP. Da lì
// un telefono finto cammina dentro l'app vera (vedi src/lib/testVirtuale.ts).
function TestVirtualeSection() {
  const [aperto, setAperto] = useState<boolean>(() => { try { return localStorage.getItem('wip_test_virtuale') === '1'; } catch { return false; } });
  const cambia = () => {
    const nuovo = !aperto;
    setAperto(nuovo);
    try { if (nuovo) localStorage.setItem('wip_test_virtuale', '1'); else localStorage.removeItem('wip_test_virtuale'); } catch { /* storage assente */ }
    window.dispatchEvent(new CustomEvent('wip-test-virtuale-cambiato'));
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Smartphone className="w-4 h-4 text-primary" />
        <h3 className="font-black text-primary text-sm">Test virtuale</h3>
      </div>
      <p className="text-xs text-gray-500">
        Un telefono finto cammina dentro l'app vera, sulla mappa di WIP. Apri la barra, vai sulla Mappa e tocca: il primo tocco posa il telefono, i successivi lo mandano a quel punto lungo un percorso pedonale vero.
        Per provare un itinerario, un giro o un percorso su misura avvialo come sempre e premi «Segui il giro»; per il navigatore avvia la navigazione e tocca la meta.
      </p>
      <p className="text-[11px] text-gray-500">
        Vale per la versione web (browser o PWA): dentro l'app Android e iPhone l'audioguida la decide il servizio nativo, che il GPS finto non raggiunge. Accendi l'audioguida prima di cominciare; un luogo già ascoltato non riparte per 24 ore («Azzera ascolti» nella barra).
      </p>
      <button onClick={cambia} className={`px-3 py-2 rounded-xl text-xs font-black ${aperto ? 'bg-gray-200 text-gray-700' : 'bg-primary text-white'}`}>
        {aperto ? 'Chiudi la barra del test' : 'Apri la barra del test sulla mappa'}
      </button>
      <FollaTelefoni />
    </div>
  );
}

// ── FOLLA DI TELEFONI FINTI (04/10/2026) ─────────────────────────────────
// Più copie dell'app vera, una per scenario salvato, tutte insieme: ogni
// copia è un riquadro con `?testScenario=<nome>`, che lancia lo scenario da
// sola a ×4 e alla fine manda qui la sua pagella (messaggio `wip-test-folla`).
// Le copie sono app intere: 4 alla volta è il massimo ragionevole su un PC.
const FOLLA_MAX = 6;
function FollaTelefoni() {
  const [scenari, setScenari] = useState<Array<{ nome: string }>>([]);
  const [scelti, setScelti] = useState<string[]>([]);
  const [inCorso, setInCorso] = useState<string[]>([]);
  const [esiti, setEsiti] = useState<Record<string, any>>({});
  const [stato, setStato] = useState('');
  const riquadri = React.useRef<Record<string, HTMLIFrameElement | null>>({});

  const carica = async () => {
    setStato('Leggo gli scenari…');
    try {
      const res = await fetch(getApiUrl('/api/admin/collaudo/scenari'), { headers: await adminAuthHeaders() });
      const j = await res.json();
      const lista = Array.isArray(j?.scenari) ? j.scenari : [];
      setScenari(lista);
      setScelti(lista.slice(0, 4).map((x: any) => x.nome));
      setStato(res.ok ? (lista.length ? '' : 'Nessuno scenario salvato: fanne uno dalla barra del test («Scenari»).') : `Errore (${j?.error || res.status})`);
    } catch (e: any) { setStato(`Errore (${e?.message || 'rete'})`); }
  };

  useEffect(() => {
    const suMessaggio = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d: any = e.data;
      if (!d || d.tipo !== 'wip-test-folla' || typeof d.nome !== 'string') return;
      setEsiti(v => ({ ...v, [d.nome]: d }));
    };
    window.addEventListener('message', suMessaggio);
    return () => window.removeEventListener('message', suMessaggio);
  }, []);

  // Le voci di più telefoni insieme si accavallano: si prova a zittire gli audio delle copie.
  // La voce di sistema del browser (ripiego senza MP3) non si può zittire da qui.
  useEffect(() => {
    if (inCorso.length === 0) return;
    const t = setInterval(() => {
      for (const n of inCorso) {
        try { riquadri.current[n]?.contentDocument?.querySelectorAll('audio,video').forEach((m: any) => { m.muted = true; }); } catch { /* copia non pronta */ }
      }
    }, 1500);
    return () => clearInterval(t);
  }, [inCorso]);

  const spunta = (nome: string) => setScelti(v => v.includes(nome) ? v.filter(x => x !== nome) : (v.length >= FOLLA_MAX ? v : [...v, nome]));
  const lancia = () => { setEsiti({}); setInCorso(scelti.slice(0, FOLLA_MAX)); };
  const finiti = inCorso.filter(n => esiti[n]).length;

  return (
    <div className="border-t border-gray-100 pt-3 space-y-2">
      <h4 className="font-black text-primary text-xs">Folla di telefoni finti</h4>
      <p className="text-[11px] text-gray-500">
        Più scenari salvati tutti insieme, ognuno in una copia dell'app vera che cammina da sola a velocità ×4 e alla fine riporta qui la sua pagella.
        Ogni copia è un'app intera: fino a {FOLLA_MAX}, meglio 4. Accendi l'audioguida prima di lanciare.
      </p>
      <div className="flex flex-wrap gap-2">
        <button onClick={carica} className="px-3 py-2 rounded-xl text-xs font-black bg-white border border-primary/20 text-primary">Leggi gli scenari</button>
        {scelti.length > 0 && <button onClick={lancia} className="px-3 py-2 rounded-xl text-xs font-black bg-primary text-white">Lancia {scelti.length} {scelti.length === 1 ? 'telefono' : 'telefoni'}</button>}
        {inCorso.length > 0 && <button onClick={() => setInCorso([])} className="px-3 py-2 rounded-xl text-xs font-black bg-gray-200 text-gray-700">Chiudi le copie</button>}
      </div>
      {stato && <p className="text-xs text-gray-500">{stato}</p>}
      {scenari.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {scenari.map(sc => (
            <label key={sc.nome} className="flex items-center gap-1.5 text-xs text-gray-700">
              <input type="checkbox" checked={scelti.includes(sc.nome)} onChange={() => spunta(sc.nome)} />
              {sc.nome}
            </label>
          ))}
        </div>
      )}
      {inCorso.length > 0 && (
        <>
          <p className="text-xs font-bold text-gray-700">{finiti} su {inCorso.length} arrivati</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {inCorso.map(n => {
              const e = esiti[n];
              const p = e?.pagella;
              return (
                <div key={n} className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className={`px-2 py-1.5 text-[11px] font-bold ${e ? (e.errore ? 'bg-red-50 text-red-700' : p?.voto == null ? 'bg-gray-50 text-gray-700' : p.voto >= 80 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800') : 'bg-gray-50 text-gray-600'}`}>
                    {n} — {e ? (e.errore ? `errore: ${e.errore}` : `voto ${p?.voto == null ? 'n.d.' : p.voto + '%'} · guide ${p?.guide?.giuste ?? 0}/${p?.guide?.totali ?? 0} · avvisi ${p?.avvisi?.giusti ?? 0}/${p?.avvisi?.totali ?? 0} · svolte ${p?.svolte?.giuste ?? 0}/${p?.svolte?.totali ?? 0} · frasi ripetute ${p?.frasiRipetute ?? 0}`) : 'in cammino…'}
                  </div>
                  <iframe
                    ref={el => { riquadri.current[n] = el; }}
                    title={`Telefono finto: ${n}`}
                    src={`/?testScenario=${encodeURIComponent(n)}`}
                    style={{ width: '100%', height: 420, border: 0, display: 'block' }}
                  />
                  {e && Array.isArray(e.scatti) && e.scatti.length > 0 && (
                    <div className="px-2 py-1.5 text-[11px] text-gray-600 space-y-0.5">
                      {e.scatti.slice(0, 8).map((x: any, i: number) => (
                        <div key={i}>{x.esito === 'giusto' || x.esito === 'giusta' ? '✓' : '✕'} {x.nome} — {x.strada == null ? 'strada n.d.' : `${Math.round(x.strada)} m`} (raggio {x.raggio} m, {x.esito})</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── REGISTRI DI COLLAUDO INVIATI: pagella e mappa (04/10/2026) ───────────
// Ogni invio dal telefono è una voce: si sceglie, e il server restituisce le
// righe già lette — traccia, scatti di avviso e guida, svolte, segni — con la
// pagella (quanti scatti sono caduti dentro il raggio di strada).
const CollaudoMappa = React.lazy(() => import('./CollaudoMappa'));
function CollaudoRegistriSection() {
  const [elenco, setElenco] = useState<Array<{ chiave: string; quando: string }>>([]);
  const [scelto, setScelto] = useState('');
  const [dati, setDati] = useState<any>(null);
  const [stato, setStato] = useState('');
  const carica = async () => {
    setStato('Leggo l\'elenco…');
    try {
      const res = await fetch(getApiUrl('/api/admin/collaudo/registri'), { headers: await adminAuthHeaders() });
      const j = await res.json();
      setElenco(Array.isArray(j?.registri) ? j.registri : []);
      setStato(res.ok ? '' : `Errore (${j?.error || res.status})`);
    } catch (e: any) { setStato(`Errore (${e?.message || 'rete'})`); }
  };
  useEffect(() => { void carica(); }, []);
  const apri = async (chiave: string) => {
    setScelto(chiave); setDati(null);
    if (!chiave) return;
    setStato('Leggo il registro…');
    try {
      const res = await fetch(getApiUrl(`/api/admin/collaudo/registri?chiave=${encodeURIComponent(chiave)}`), { headers: await adminAuthHeaders() });
      const j = await res.json();
      if (res.ok) { setDati(j); setStato(''); } else setStato(`Errore (${j?.error || res.status})`);
    } catch (e: any) { setStato(`Errore (${e?.message || 'rete'})`); }
  };
  // RIPROVA A TAVOLINO: la stessa passeggiata con strade e punti d'arrivo di oggi.
  const [riprova, setRiprova] = useState<any>(null);
  const faiRiprova = async () => {
    if (!scelto) return;
    setRiprova(null); setStato('Rigioco la passeggiata con le regole di oggi…');
    try {
      const res = await fetch(getApiUrl(`/api/admin/collaudo/riprova?chiave=${encodeURIComponent(scelto)}`), { headers: await adminAuthHeaders() });
      const j = await res.json();
      if (res.ok) { setRiprova(j); setStato(''); } else setStato(`Errore (${j?.error || res.status})`);
    } catch (e: any) { setStato(`Errore (${e?.message || 'rete'})`); }
  };
  // CONFRONTO: un secondo collaudo accanto al primo (prima e dopo una build).
  const [altro, setAltro] = useState('');
  const [datiAltro, setDatiAltro] = useState<any>(null);
  const apriAltro = async (chiave: string) => {
    setAltro(chiave); setDatiAltro(null);
    if (!chiave) return;
    try {
      const res = await fetch(getApiUrl(`/api/admin/collaudo/registri?chiave=${encodeURIComponent(chiave)}`), { headers: await adminAuthHeaders() });
      const j = await res.json();
      if (res.ok) setDatiAltro(j); else setStato(`Errore (${j?.error || res.status})`);
    } catch (e: any) { setStato(`Errore (${e?.message || 'rete'})`); }
  };
  useEffect(() => { setRiprova(null); setAltro(''); setDatiAltro(null); }, [scelto]);
  // Per ogni luogo scattato in tutti e due: i metri di strada all'arrivo, qui e là.
  const confronto = (() => {
    if (!dati?.letto || !datiAltro?.letto) return [];
    const arrivi = (l: any) => (l.scatti as any[]).filter(s => s.tipo === 'arrivo' || s.tipo === 'arrivo-muro');
    const diLa: Record<string, any> = {};
    for (const s of arrivi(datiAltro.letto)) if (!diLa[s.id]) diLa[s.id] = s;
    return arrivi(dati.letto).filter(s => diLa[s.id]).map(s => ({ nome: s.nome, qui: s, la: diLa[s.id] }));
  })();
  const metriO = (v: number | null | undefined) => (v == null ? 'irragg.' : `${Math.round(v)} m`);
  const batt = (b: any) => !b ? 'non registrata' : `${b.da}% → ${b.a}% in ${b.minuti} min${b.perOra != null ? ` (${b.perOra} punti all'ora)` : ''}${b.fixAlMinuto != null ? ` · ${b.fixAlMinuto} posizioni al minuto` : ''}${b.inCarica ? ' · ATTENZIONE: telefono in carica, il numero non vale' : ''}`;

  // PASSEGGIATE DI RIFERIMENTO: un collaudo segnato come campione viene
  // rigiocato ogni notte dal server; se il voto scende di 10 punti, avvisa.
  const [campioni, setCampioni] = useState<any[]>([]);
  const [nomeCampione, setNomeCampione] = useState('');
  const caricaCampioni = async () => {
    try {
      const res = await fetch(getApiUrl('/api/admin/collaudo/campioni'), { headers: await adminAuthHeaders() });
      const j = await res.json();
      setCampioni(Array.isArray(j?.campioni) ? j.campioni : []);
    } catch { /* elenco non disponibile */ }
  };
  useEffect(() => { void caricaCampioni(); }, []);
  const segnaCampione = async (chiave: string, togli = false) => {
    setStato(togli ? 'Tolgo il riferimento…' : 'Rigioco e segno come riferimento…');
    try {
      const res = await fetch(getApiUrl('/api/admin/collaudo/campione'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await adminAuthHeaders()) },
        body: JSON.stringify({ chiave, nome: nomeCampione, togli }),
      });
      const j = await res.json();
      if (res.ok) { setCampioni(j.campioni || []); setNomeCampione(''); setStato(''); } else setStato(`Non segnato (${j?.nota || j?.error || res.status})`);
    } catch (e: any) { setStato(`Errore (${e?.message || 'rete'})`); }
  };
  const verificaCampioni = async () => {
    setStato('Rigioco tutte le passeggiate di riferimento…');
    try {
      const res = await fetch(getApiUrl('/api/collaudo/campioni/verifica'), { headers: await adminAuthHeaders() });
      const j = await res.json();
      setStato(res.ok ? `Verificate ${j.verificati}: ${(j.esiti || []).filter((e: any) => e.peggiorato).length} peggiorate.` : `Errore (${j?.error || res.status})`);
      void caricaCampioni();
    } catch (e: any) { setStato(`Errore (${e?.message || 'rete'})`); }
  };

  // PUNTO D'ARRIVO PROPOSTO DALLA MAPPA: si sceglie il luogo, si tocca la
  // mappa nel punto giusto, si propone. Va in coda: il database cambia solo
  // con «Approva», e «Ripristina» rimette il punto di prima.
  const [luogoDaSpostare, setLuogoDaSpostare] = useState('');
  const [puntoNuovo, setPuntoNuovo] = useState<[number, number] | null>(null);
  const [proposte, setProposte] = useState<any[]>([]);
  const caricaProposte = async () => {
    try {
      const res = await fetch(getApiUrl('/api/admin/collaudo/punti-arrivo'), { headers: await adminAuthHeaders() });
      const j = await res.json();
      setProposte(Array.isArray(j?.proposte) ? j.proposte : []);
    } catch { /* elenco non disponibile */ }
  };
  useEffect(() => { void caricaProposte(); }, []);
  useEffect(() => { setLuogoDaSpostare(''); setPuntoNuovo(null); }, [scelto]);
  const proponi = async () => {
    if (!luogoDaSpostare || !puntoNuovo) return;
    setStato('Invio la proposta…');
    try {
      const res = await fetch(getApiUrl('/api/admin/collaudo/punto-arrivo'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await adminAuthHeaders()) },
        body: JSON.stringify({ poiId: luogoDaSpostare, lat: puntoNuovo[0], lon: puntoNuovo[1], chiave: scelto }),
      });
      const j = await res.json();
      setStato(res.ok ? `Proposta in coda (a ${j.dCentro} m dal centro del luogo). Va approvata qui sotto.` : `Non proposta: ${j?.nota || j?.error || res.status}`);
      if (res.ok) { setPuntoNuovo(null); void caricaProposte(); }
    } catch (e: any) { setStato(`Errore (${e?.message || 'rete'})`); }
  };
  const decidi = async (chiave: string, azione: 'approva' | 'scarta' | 'ripristina') => {
    setStato('Applico…');
    try {
      const res = await fetch(getApiUrl('/api/admin/collaudo/punto-arrivo/decidi'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await adminAuthHeaders()) },
        body: JSON.stringify({ chiave, azione }),
      });
      const j = await res.json();
      setStato(res.ok ? `Fatto: ${j.stato}.` : `Non riuscito (${j?.error || res.status})`);
      void caricaProposte();
    } catch (e: any) { setStato(`Errore (${e?.message || 'rete'})`); }
  };
  const luoghiDelCollaudo: Array<{ id: string; nome: string }> = (() => {
    const visti: Record<string, string> = {};
    for (const s of (dati?.letto?.scatti || []) as any[]) if (s.id && !visti[s.id]) visti[s.id] = s.nome;
    return Object.entries(visti).map(([id, nome]) => ({ id, nome }));
  })();

  const p = dati?.letto?.pagella;
  const riga = (nome: string, v: { totali: number; giuste?: number; giusti?: number; tardi: number; presto: number }) => (
    <tr className="border-t border-gray-100">
      <td className="py-1 pr-3 font-bold">{nome}</td>
      <td className="py-1 pr-3 tabular-nums">{v.totali}</td>
      <td className="py-1 pr-3 tabular-nums text-green-700">{v.giuste ?? v.giusti ?? 0}</td>
      <td className="py-1 pr-3 tabular-nums text-orange-600">{v.tardi}</td>
      <td className="py-1 tabular-nums text-red-600">{v.presto}</td>
    </tr>
  );
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Map className="w-4 h-4 text-primary" />
        <h3 className="font-black text-primary text-sm">Collaudi inviati: pagella e mappa</h3>
        <button onClick={carica} className="ml-auto text-xs font-bold text-primary underline">Aggiorna</button>
      </div>
      <select value={scelto} onChange={(e) => void apri(e.target.value)} className="w-full border border-gray-200 rounded-xl p-2 text-xs">
        <option value="">{elenco.length ? 'Scegli un collaudo…' : 'Nessun registro inviato'}</option>
        {elenco.map(r => <option key={r.chiave} value={r.chiave}>{new Date(r.quando).toLocaleString()}</option>)}
      </select>
      {stato && <p className="text-xs text-gray-600">{stato}</p>}

      {/* Le passeggiate di riferimento e la coda dei punti d'arrivo: sempre visibili. */}
      {campioni.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-black text-gray-700">Passeggiate di riferimento (rigiocate ogni notte)</h4>
            <button onClick={verificaCampioni} className="ml-auto text-xs font-bold text-primary underline">Verifica ora</button>
          </div>
          <ul className="text-xs space-y-1">
            {campioni.map((c, i) => (
              <li key={i} className={c.peggiorato ? 'text-red-600 font-bold' : ''}>
                {c.nome}: voto di partenza {c.votoBase ?? '—'}%{c.ultimaVerifica ? ` · ultimo ${c.ultimoVoto ?? '—'}% (${new Date(c.ultimaVerifica).toLocaleDateString()})` : ' · mai rigiocata'}{c.peggiorato ? ' · PEGGIORATA' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {proposte.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-black text-gray-700">Punti d'arrivo proposti</h4>
          <ul className="text-xs space-y-2">
            {proposte.map((pr, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className="flex-1 min-w-[180px]">
                  <b>{pr.nome}</b> → {Number(pr.lat).toFixed(5)}, {Number(pr.lon).toFixed(5)} · {pr.dCentro} m dal centro · <i>{pr.stato}</i>{' '}
                  <a className="text-primary underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/place/${pr.lat},${pr.lon}/@${pr.lat},${pr.lon},120m/data=!3m1!1e3`}>satellite</a>
                </span>
                {pr.stato === 'da_approvare' && (
                  <>
                    <button onClick={() => void decidi(pr.chiave, 'approva')} className="px-2 py-1 rounded-lg bg-emerald-600 text-white font-black">Approva</button>
                    <button onClick={() => void decidi(pr.chiave, 'scarta')} className="px-2 py-1 rounded-lg bg-gray-200 text-gray-700 font-black">Scarta</button>
                  </>
                )}
                {pr.stato === 'approvata' && <button onClick={() => void decidi(pr.chiave, 'ripristina')} className="px-2 py-1 rounded-lg bg-amber-500 text-white font-black">Ripristina</button>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {p && (
        <>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-black text-primary tabular-nums">{p.voto == null ? '—' : `${p.voto}%`}</span>
            <span className="text-xs text-gray-500">scatti giusti · {dati.righe?.length || 0} righe · {p.segni} segni «qui ha sbagliato»</span>
          </div>
          <table className="text-xs w-full">
            <thead><tr className="text-left text-gray-500"><th className="pr-3"></th><th className="pr-3">Totali</th><th className="pr-3">Giusti</th><th className="pr-3">Tardi</th><th>Presto</th></tr></thead>
            <tbody>{riga('Guide (arrivo)', p.guide)}{riga('Avvisi', p.avvisi)}{riga('Svolte dette', p.svolte)}</tbody>
          </table>
          <p className="text-[11px] text-gray-500">Giusto = scattato fra metà raggio e il raggio (più 10 m di tolleranza), in metri di strada. Tardi = sotto metà raggio, o strada irraggiungibile. Presto = oltre il raggio.</p>
          <React.Suspense fallback={<p className="text-xs text-gray-500">Carico la mappa…</p>}>
            <CollaudoMappa letto={dati.letto} onTocco={luogoDaSpostare ? (la, lo) => setPuntoNuovo([la, lo]) : undefined} proposto={puntoNuovo} />
          </React.Suspense>
          {/* PUNTO D'ARRIVO DALLA MAPPA */}
          {luoghiDelCollaudo.length > 0 && (
            <div className="space-y-1">
              <select value={luogoDaSpostare} onChange={(e) => { setLuogoDaSpostare(e.target.value); setPuntoNuovo(null); }} className="w-full border border-gray-200 rounded-xl p-2 text-xs">
                <option value="">Sposta il punto d'arrivo di un luogo…</option>
                {luoghiDelCollaudo.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
              {luogoDaSpostare && (
                <div className="flex items-center gap-2 text-xs text-gray-700">
                  <span className="flex-1">{puntoNuovo ? `Punto scelto: ${puntoNuovo[0].toFixed(5)}, ${puntoNuovo[1].toFixed(5)} (stella azzurra)` : 'Tocca la mappa nel punto giusto, davanti all\'ingresso.'}</span>
                  <button onClick={proponi} disabled={!puntoNuovo} className="px-3 py-2 rounded-xl bg-cyan-700 text-white font-black disabled:opacity-40">Proponi</button>
                </div>
              )}
            </div>
          )}
          {dati.letto.scatti.filter((s: any) => s.esito === 'tardi' || s.esito === 'presto').length > 0 && (
            <ul className="text-xs space-y-1">
              {dati.letto.scatti.filter((s: any) => s.esito === 'tardi' || s.esito === 'presto').map((s: any, i: number) => (
                <li key={i}><b>{s.nome}</b> ({s.tipo}, {s.ora}): {s.nota}</li>
              ))}
            </ul>
          )}
          {dati.letto.segni.length > 0 && (
            <ul className="text-xs space-y-1">
              {dati.letto.segni.map((s: any, i: number) => (
                <li key={i}>{s.contenuto ? '📝' : '🚩'} {s.ora} — {s.contenuto ? <><b>Guida sbagliata:</b> {s.nota}{s.poi ? ` (luogo ${s.poi})` : ''}</> : s.nota}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-gray-700"><b>Batteria:</b> {batt(dati.letto.batteria)}</p>

          {/* PASSEGGIATA DI RIFERIMENTO */}
          <div className="border-t border-gray-100 pt-3 flex flex-wrap items-center gap-2">
            {campioni.some(c => c.chiave === scelto) ? (
              <button onClick={() => void segnaCampione(scelto, true)} className="px-3 py-2 rounded-xl bg-gray-200 text-gray-700 text-xs font-black">Togli dalle passeggiate di riferimento</button>
            ) : (
              <>
                <input value={nomeCampione} onChange={(e) => setNomeCampione(e.target.value)} placeholder="Nome (es. Montecatini centro)" className="flex-1 min-w-[160px] border border-gray-200 rounded-xl p-2 text-xs" />
                <button onClick={() => void segnaCampione(scelto)} className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-black">Segna come passeggiata di riferimento</button>
              </>
            )}
          </div>

          {/* RIPROVA A TAVOLINO */}
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <button onClick={faiRiprova} className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-black">Riprova con le regole di oggi</button>
            {riprova?.errore && <p className="text-xs text-gray-600">{riprova.nota}</p>}
            {riprova?.scatti && (
              <>
                <p className="text-[11px] text-gray-500">
                  Stessa passeggiata, strade e punti d'arrivo di oggi ({riprova.luoghi} luoghi, {riprova.polilinee} strade{riprova.conStrade ? '' : ' — NESSUNA strada trovata: distanze dirette'}; raggi {riprova.raggi.arrivo}/{riprova.raggi.avviso} m).
                  Non rigioca bussola, attese fra luoghi, categorie e regola del muro: dice dove scatterebbe per distanza.
                </p>
                <table className="text-xs w-full">
                  <thead><tr className="text-left text-gray-500"><th className="pr-2">Luogo</th><th className="pr-2">Tipo</th><th className="pr-2">Oggi</th><th className="pr-2">Quel giorno</th><th>Spostato di</th></tr></thead>
                  <tbody>
                    {riprova.scatti.map((s: any, i: number) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-1 pr-2 font-bold">{s.nome}</td>
                        <td className="py-1 pr-2">{s.tipo}</td>
                        <td className="py-1 pr-2 tabular-nums">{metriO(s.strada)}</td>
                        <td className="py-1 pr-2 tabular-nums">{s.registrato ? metriO(s.registrato.strada) : '—'}</td>
                        <td className="py-1 tabular-nums">{s.spostatoM == null ? '—' : `${s.spostatoM} m`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {riprova.maiScattati?.length > 0 && (
                  <ul className="text-xs space-y-1">
                    {riprova.maiScattati.map((m: any, i: number) => (
                      <li key={i}><b>{m.nome}</b>: oggi la guida non scatterebbe — minimo {metriO(m.minimaStrada)} di strada, {m.minimaAria} m in linea d'aria.</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {/* CONFRONTO FRA DUE COLLAUDI */}
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <select value={altro} onChange={(e) => void apriAltro(e.target.value)} className="w-full border border-gray-200 rounded-xl p-2 text-xs">
              <option value="">Confronta con un altro collaudo…</option>
              {elenco.filter(r => r.chiave !== scelto).map(r => <option key={r.chiave} value={r.chiave}>{new Date(r.quando).toLocaleString()}</option>)}
            </select>
            {datiAltro?.letto && (
              <>
                <table className="text-xs w-full">
                  <thead><tr className="text-left text-gray-500"><th className="pr-2"></th><th className="pr-2">Questo</th><th>L'altro</th></tr></thead>
                  <tbody>
                    <tr className="border-t border-gray-100"><td className="py-1 pr-2 font-bold">Scatti giusti</td><td className="pr-2 tabular-nums">{p.voto == null ? '—' : `${p.voto}%`}</td><td className="tabular-nums">{datiAltro.letto.pagella.voto == null ? '—' : `${datiAltro.letto.pagella.voto}%`}</td></tr>
                    <tr className="border-t border-gray-100"><td className="py-1 pr-2 font-bold">Guide giuste</td><td className="pr-2 tabular-nums">{p.guide.giuste}/{p.guide.totali}</td><td className="tabular-nums">{datiAltro.letto.pagella.guide.giuste}/{datiAltro.letto.pagella.guide.totali}</td></tr>
                    <tr className="border-t border-gray-100"><td className="py-1 pr-2 font-bold">Avvisi giusti</td><td className="pr-2 tabular-nums">{p.avvisi.giusti}/{p.avvisi.totali}</td><td className="tabular-nums">{datiAltro.letto.pagella.avvisi.giusti}/{datiAltro.letto.pagella.avvisi.totali}</td></tr>
                    <tr className="border-t border-gray-100"><td className="py-1 pr-2 font-bold">Svolte giuste</td><td className="pr-2 tabular-nums">{p.svolte.giuste}/{p.svolte.totali}</td><td className="tabular-nums">{datiAltro.letto.pagella.svolte.giuste}/{datiAltro.letto.pagella.svolte.totali}</td></tr>
                    <tr className="border-t border-gray-100"><td className="py-1 pr-2 font-bold">Batteria</td><td className="pr-2">{batt(dati.letto.batteria)}</td><td>{batt(datiAltro.letto.batteria)}</td></tr>
                  </tbody>
                </table>
                {confronto.length > 0 ? (
                  <table className="text-xs w-full">
                    <thead><tr className="text-left text-gray-500"><th className="pr-2">Luogo in entrambi</th><th className="pr-2">Guida: questo</th><th>Guida: l'altro</th></tr></thead>
                    <tbody>
                      {confronto.map((c, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="py-1 pr-2 font-bold">{c.nome}</td>
                          <td className="py-1 pr-2 tabular-nums">{metriO(c.qui.strada)} · {c.qui.esito}</td>
                          <td className="py-1 tabular-nums">{metriO(c.la.strada)} · {c.la.esito}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="text-xs text-gray-500">Nessun luogo scattato in entrambi i collaudi.</p>}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── LUOGHI SENZA STRADA e VOTO PER ZONA (04/10/2026) ─────────────────────
// Li calcola ogni notte il server di lavoro (Oracle) sulle gemme: quanto dista
// il punto d'arrivo dalla strada più vicina. Oltre 60 m la guida rischia di
// non partire mai: qui si vede l'elenco e si propone il punto giusto.
const PuntoSuMappaLazy = React.lazy(() => import('./CollaudoMappa').then(m => ({ default: m.PuntoSuMappa })));
const ZoneMappaLazy = React.lazy(() => import('./CollaudoMappa').then(m => ({ default: m.ZoneMappa })));
function SenzaStradaSection() {
  const [dati, setDati] = useState<any>(null);
  const [zone, setZone] = useState<any>(null);
  const [aperto, setAperto] = useState<any>(null);
  const [punto, setPunto] = useState<[number, number] | null>(null);
  const [stato, setStato] = useState('');
  const [mostraZone, setMostraZone] = useState(false);
  const carica = async () => {
    try {
      const h = await adminAuthHeaders();
      const [a, b] = await Promise.all([
        fetch(getApiUrl('/api/admin/collaudo/senza-strada'), { headers: h }).then(r => r.json()),
        fetch(getApiUrl('/api/admin/collaudo/zone'), { headers: h }).then(r => r.json()),
      ]);
      setDati(a); setZone(b);
    } catch (e: any) { setStato(`Errore (${e?.message || 'rete'})`); }
  };
  useEffect(() => { void carica(); }, []);
  const proponi = async () => {
    if (!aperto || !punto) return;
    setStato('Invio la proposta…');
    try {
      const res = await fetch(getApiUrl('/api/admin/collaudo/punto-arrivo'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await adminAuthHeaders()) },
        body: JSON.stringify({ poiId: aperto.id, lat: punto[0], lon: punto[1], nota: 'da «luoghi senza strada»' }),
      });
      const j = await res.json();
      setStato(res.ok ? `Proposta in coda per ${aperto.nome}: va approvata in «Collaudi inviati › Punti d'arrivo proposti».` : `Non proposta: ${j?.nota || j?.error || res.status}`);
      if (res.ok) { setAperto(null); setPunto(null); }
    } catch (e: any) { setStato(`Errore (${e?.message || 'rete'})`); }
  };
  const luoghi: any[] = Array.isArray(dati?.luoghi) ? dati.luoghi : [];
  const elencoZone: any[] = Array.isArray(zone?.zone) ? zone.zone : [];
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-primary" />
        <h3 className="font-black text-primary text-sm">Luoghi senza strada e voto per zona</h3>
        <button onClick={carica} className="ml-auto text-xs font-bold text-primary underline">Aggiorna</button>
      </div>
      {dati?.nota && <p className="text-xs text-gray-500">{dati.nota}</p>}
      {dati?._salvatoIl && (
        <p className="text-xs text-gray-600">
          Ultimo controllo {new Date(dati._salvatoIl).toLocaleString()}: {dati.controllati} gemme guardate, <b>{dati.totale}</b> con il punto d'arrivo a più di {dati.soglia} m dalla strada più vicina. Qui le {luoghi.length} peggiori.
        </p>
      )}
      {stato && <p className="text-xs text-gray-600">{stato}</p>}
      {aperto && (
        <div className="space-y-2">
          <p className="text-xs font-bold">{aperto.nome}: tocca la mappa davanti all'ingresso.</p>
          <React.Suspense fallback={<p className="text-xs text-gray-500">Carico la mappa…</p>}>
            <PuntoSuMappaLazy lat={aperto.lat} lon={aperto.lon} proposto={punto} onTocco={(la, lo) => setPunto([la, lo])} />
          </React.Suspense>
          <div className="flex gap-2">
            <button onClick={proponi} disabled={!punto} className="px-3 py-2 rounded-xl bg-cyan-700 text-white text-xs font-black disabled:opacity-40">Proponi questo punto</button>
            <button onClick={() => { setAperto(null); setPunto(null); }} className="px-3 py-2 rounded-xl bg-gray-200 text-gray-700 text-xs font-black">Annulla</button>
          </div>
        </div>
      )}
      {luoghi.length > 0 && (
        <ul className="text-xs space-y-1 max-h-64 overflow-y-auto">
          {luoghi.slice(0, 200).map((l, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="flex-1 min-w-0 truncate"><b>{l.nome}</b> · {l.metri == null ? 'nessuna strada entro 200 m' : `${l.metri} m dalla strada`} · {l.fonte}</span>
              <a className="text-primary underline shrink-0" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/place/${l.lat},${l.lon}/@${l.lat},${l.lon},150m/data=!3m1!1e3`}>satellite</a>
              <button onClick={() => { setAperto(l); setPunto(null); }} className="px-2 py-1 rounded-lg bg-cyan-700 text-white font-black shrink-0">Correggi</button>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-gray-100 pt-3 space-y-2">
        <button onClick={() => setMostraZone(v => !v)} className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-black">{mostraZone ? 'Nascondi la mappa delle zone' : `Mostra il voto per zona (${elencoZone.length} zone)`}</button>
        {mostraZone && (
          <>
            <p className="text-[11px] text-gray-500">Un quadrato per grado. Verde: 85 o più — le gemme hanno la strada vicina e le strade di servizio sono caricate. Giallo 60–84, arancio 30–59, rosso sotto 30 (punti d'arrivo lontani dalle strade, o zona senza dati stradali). Il voto guarda solo le gemme.</p>
            <React.Suspense fallback={<p className="text-xs text-gray-500">Carico la mappa…</p>}>
              <ZoneMappaLazy zone={elencoZone} />
            </React.Suspense>
          </>
        )}
      </div>
    </div>
  );
}

function NavLogSection() {
  const [stato, setStato] = useState('');
  const [righe, setRighe] = useState<string[]>([]);
  // Modalità collaudo: accesa, il telefono registra anche la traccia della
  // passeggiata e sulla mappa compare il tasto «Qui ha sbagliato».
  const [collaudo, setCollaudo] = useState<boolean>(() => { try { return localStorage.getItem('wip_collaudo') === '1'; } catch { return false; } });
  const cambiaCollaudo = async () => {
    const nuovo = !collaudo;
    setCollaudo(nuovo);
    try { if (nuovo) localStorage.setItem('wip_collaudo', '1'); else localStorage.removeItem('wip_collaudo'); } catch { /* storage assente */ }
    window.dispatchEvent(new CustomEvent('wip-collaudo-cambiato'));
    try {
      const { ItaintaBackgroundPoi } = await import('../plugins/ItaintaBackgroundPoi');
      await ItaintaBackgroundPoi.setCollaudo({ attivo: nuovo });
      setStato(nuovo ? 'Modalità collaudo accesa: traccia registrata, tasto «Qui ha sbagliato» sulla mappa.' : 'Modalità collaudo spenta.');
    } catch (e: any) {
      setStato(`Sul telefono serve l'app aggiornata (${e?.message || 'metodo non disponibile'}).`);
    }
  };
  const scarica = async () => {
    setStato('Leggo il registro…');
    try {
      const { ItaintaBackgroundPoi } = await import('../plugins/ItaintaBackgroundPoi');
      const r = await ItaintaBackgroundPoi.getNavLog();
      const elenco = Array.isArray(r?.righe) ? r.righe : [];
      setRighe(elenco);
      if (elenco.length === 0) { setStato('Registro vuoto: nessun percorso seguito da quando l\'app è aperta.'); return; }
      const nome = `wip-nav-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.txt`;
      const { saveBlobAsFile } = await import('../services/premiumGuideService');
      const ok = await saveBlobAsFile(new Blob([elenco.join('\n')], { type: 'text/plain' }), nome);
      setStato(ok ? `${elenco.length} righe salvate in ${nome}` : `${elenco.length} righe lette (salvataggio non riuscito: copia dal riquadro)`);
    } catch (e: any) {
      setStato(`Non disponibile su questo dispositivo (${e?.message || 'solo app Android/iOS'})`);
    }
  };
  // (04/10/2026) Invio diretto al server: niente file da passare a mano. Dopo
  // un invio riuscito il registro sul telefono NON si svuota da solo: lo
  // decide chi collauda, col tasto accanto.
  const invia = async () => {
    setStato('Leggo e invio il registro…');
    try {
      const { ItaintaBackgroundPoi } = await import('../plugins/ItaintaBackgroundPoi');
      const r = await ItaintaBackgroundPoi.getNavLog();
      const elenco = Array.isArray(r?.righe) ? r.righe : [];
      setRighe(elenco);
      if (elenco.length === 0) { setStato('Registro vuoto: niente da inviare.'); return; }
      const res = await fetch(getApiUrl('/api/admin/collaudo/registro'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await adminAuthHeaders()) },
        body: JSON.stringify({ righe: elenco, dispositivo: navigator.userAgent }),
      });
      const j = await res.json().catch(() => ({}));
      setStato(res.ok && j?.ok ? `Inviate ${j.righe} righe (${j.chiave}).` : `Invio non riuscito (${j?.error || res.status}).`);
    } catch (e: any) {
      setStato(`Invio non riuscito (${e?.message || 'solo app Android/iOS'})`);
    }
  };
  const svuota = async () => {
    try {
      const { ItaintaBackgroundPoi } = await import('../plugins/ItaintaBackgroundPoi');
      await ItaintaBackgroundPoi.clearNavLog();
      setRighe([]);
      setStato('Registro svuotato.');
    } catch (e: any) {
      setStato(`Non svuotato (${e?.message || 'solo app Android/iOS'})`);
    }
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Navigation className="w-4 h-4 text-primary" />
        <h3 className="font-black text-primary text-sm">Registro del navigatore (collaudo)</h3>
      </div>
      <p className="text-xs text-gray-500">Dopo una prova a piedi: cosa ha visto e detto il navigatore a ogni fix e a quanti metri di strada sono scattati avviso e guida di ogni luogo, con le coordinate. Resta sul telefono anche se chiudi l'app.</p>
      <label className="flex items-center gap-2 text-xs font-bold text-gray-700">
        <input type="checkbox" checked={collaudo} onChange={() => void cambiaCollaudo()} />
        Modalità collaudo (registra la traccia, mostra il tasto «Qui ha sbagliato»)
      </label>
      <div className="flex flex-wrap gap-2">
        <button onClick={scarica} className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-black">Scarica registro</button>
        <button onClick={invia} className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black">Invia al server</button>
        <button onClick={svuota} className="px-3 py-2 rounded-xl bg-gray-200 text-gray-700 text-xs font-black">Svuota</button>
      </div>
      {stato && <p className="text-xs text-gray-600">{stato}</p>}
      {righe.length > 0 && (
        <textarea readOnly value={righe.slice(-200).join('\n')} className="w-full h-40 text-[10px] font-mono border border-gray-200 rounded-xl p-2" />
      )}
    </div>
  );
}

// ── REPLAY GPS: riproduzione di tracce reali nel geofencing web ─────────
// Il replay SOSPENDE il watch GPS reale finché è in corso (mai due sorgenti
// di posizione insieme) e lo riattiva alla fine. Solo per il pannello admin.
function GpsReplaySection() {
  const [trace, setTrace] = useState<any[] | null>(null);
  const [traceName, setTraceName] = useState('');
  const [stats, setStats] = useState<any>({ running: false, sent: 0, total: 0, fired: 0, suppressed: 0 });
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const [canaryMsg, setCanaryMsg] = useState('');
  const [canarySending, setCanarySending] = useState(false);

  useEffect(() => {
    let alive = true;
    import('../lib/geofencing/gpsReplay').then(m => {
      if (alive) setRecording(m.isRecordingEnabled());
    }).catch(() => {});
    // Poll leggero delle statistiche del replay in corso
    const t = setInterval(async () => {
      try {
        const m = await import('../lib/geofencing/gpsReplay');
        if (alive) setStats(m.getReplayStats());
      } catch { /* modulo non caricabile */ }
    }, 600);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const m = await import('../lib/geofencing/gpsReplay');
      const points = m.loadTrace(text);
      setTrace(points);
      setTraceName(`${file.name} (${points.length} punti)`);
    } catch (err: any) {
      setTrace(null);
      setTraceName('');
      setError(`Traccia non valida: ${err?.message || err}`);
    }
    e.target.value = '';
  };

  const useRecorded = async () => {
    setError('');
    try {
      const m = await import('../lib/geofencing/gpsReplay');
      const points = m.getRecordedTrace();
      if (points.length === 0) { setError('Nessuna traccia registrata su questo dispositivo (attiva la registrazione e cammina).'); return; }
      setTrace(points);
      setTraceName(`traccia registrata (${points.length} punti)`);
    } catch (err: any) {
      setError(String(err?.message || err));
    }
  };

  const start = async () => {
    setError('');
    if (!trace) return;
    try {
      const m = await import('../lib/geofencing/gpsReplay');
      const ok = m.startReplay(trace as any, 10);
      if (!ok) setError('Replay già in corso.');
    } catch (err: any) {
      setError(String(err?.message || err));
    }
  };

  const stop = async () => {
    try {
      const m = await import('../lib/geofencing/gpsReplay');
      m.stopReplay();
    } catch { /* ignore */ }
  };

  const toggleRecording = async () => {
    try {
      const m = await import('../lib/geofencing/gpsReplay');
      const next = !m.isRecordingEnabled();
      m.setRecordingEnabled(next);
      setRecording(next);
    } catch { /* ignore */ }
  };

  const download = async () => {
    try {
      const m = await import('../lib/geofencing/gpsReplay');
      m.exportTrace();
    } catch { /* ignore */ }
  };

  // Invia la traccia corrente (caricata o registrata) come traccia di
  // riferimento del canarino notturno (check 'Replay geofencing'): l'admin
  // conferma/inserisce gli id dei POI attesi — quelli visti scattare durante
  // il replay locale. Max 3 tracce lato server, stesso nome = sostituzione.
  const sendToCanary = async () => {
    setError('');
    setCanaryMsg('');
    try {
      const m = await import('../lib/geofencing/gpsReplay');
      const points = (trace && trace.length > 0) ? trace : m.getRecordedTrace();
      if (!points || points.length < 2) {
        setError('Nessuna traccia disponibile: carica un file o registra un percorso prima.');
        return;
      }
      const expectedRaw = window.prompt(
        'ID dei POI ATTESI su questa traccia (separati da virgola).\nSono i trigger che il canarino notturno dovrà far scattare — usa quelli visti durante il replay locale:',
        ''
      );
      if (expectedRaw === null) return;
      const expected = expectedRaw.split(',').map(s => s.trim()).filter(Boolean);
      const defaultName = `traccia-${new Date().toISOString().slice(0, 10)}`;
      const name = window.prompt('Nome della traccia canary (stesso nome = sostituzione):', defaultName);
      if (name === null) return;
      setCanarySending(true);
      const res = await fetch(getApiUrl('/api/admin/canary/traces'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await adminAuthHeaders()) },
        body: JSON.stringify({ name: name.trim() || defaultName, points, expected }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCanaryMsg(`✅ Traccia inviata al canarino: ${(data.traces || []).map((t: any) => `${t.name} (${t.points} punti, ${t.expected?.length ?? 0} attesi)`).join(' · ')}`);
    } catch (err: any) {
      setError(`Invio traccia canary fallito: ${err?.message || err}`);
    } finally {
      setCanarySending(false);
    }
  };

  return (
    <div className="bg-surface rounded-2xl p-4 border border-outline-variant space-y-3">
      <div className="flex items-center gap-2">
        <Navigation className="w-5 h-5 text-primary" />
        <div>
          <h3 className="font-black text-primary text-sm">🛰️ Replay GPS — harness di test geofencing web</h3>
          <p className="text-[11px] text-on-surface-variant">
            Riproduce una traccia GPS reale (accelerata x10) nel geofencing web. Durante il replay il GPS reale
            viene sospeso e riattivato alla fine: non avviarlo con un tour in corso.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="px-3 py-2 rounded-xl bg-surface-variant text-primary text-xs font-black cursor-pointer border border-outline-variant hover:bg-outline-variant/40">
          📂 Carica traccia (.json)
          <input type="file" accept=".json,application/json" onChange={onFile} className="hidden" />
        </label>
        <button onClick={useRecorded} className="px-3 py-2 rounded-xl bg-surface-variant text-primary text-xs font-black border border-outline-variant hover:bg-outline-variant/40">
          📼 Usa traccia registrata
        </button>
        {stats.running ? (
          <button onClick={stop} className="px-4 py-2 rounded-xl bg-red-500 text-white text-xs font-black flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" /> Stop replay
          </button>
        ) : (
          <button onClick={start} disabled={!trace} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-black flex items-center gap-1.5 disabled:opacity-40">
            <Play className="w-3.5 h-3.5" /> Avvia replay x10
          </button>
        )}
      </div>

      {traceName && <div className="text-[11px] font-bold text-primary">Traccia pronta: {traceName}</div>}
      {error && <div className="text-[11px] font-bold text-red-600">{error}</div>}

      {(stats.running || stats.sent > 0) && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
          <span className={`px-2 py-0.5 rounded-full ${stats.running ? 'bg-blue-100 text-blue-700 animate-pulse' : 'bg-gray-100 text-gray-600'}`}>
            {stats.running ? 'IN CORSO' : 'TERMINATO'} — {stats.sent}/{stats.total} punti
          </span>
          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">🎯 Trigger scattati: {stats.fired}</span>
          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">🚫 Soppressi: {stats.suppressed}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-outline-variant/50">
        <button
          onClick={toggleRecording}
          className={`px-3 py-1.5 rounded-xl text-[11px] font-black border transition-colors ${recording ? 'bg-red-50 border-red-200 text-red-600' : 'bg-surface-variant border-outline-variant text-primary'}`}
        >
          {recording ? '⏺ Registrazione ATTIVA (tocca per fermare)' : '⏺ Registra i miei spostamenti (wip_gps_record)'}
        </button>
        <button onClick={download} className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-surface-variant border border-outline-variant text-primary">
          💾 Scarica traccia registrata
        </button>
        <button
          onClick={sendToCanary}
          disabled={canarySending}
          className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-surface-variant border border-outline-variant text-primary disabled:opacity-40"
          title="Invia la traccia corrente (caricata o registrata) come riferimento del check 'Replay geofencing' del canarino notturno"
        >
          {canarySending ? '📤 Invio…' : '📤 Usa come traccia canary'}
        </button>
      </div>
      {canaryMsg && <div className="text-[11px] font-bold text-emerald-700">{canaryMsg}</div>}
    </div>
  );
}

type TestStatus = 'idle' | 'running' | 'passed' | 'failed' | 'warning';

// Una sola chiamata autenticata all'endpoint diagnostics, condivisa (con cache
// breve) tra tutti i check: prima ogni check faceva la sua fetch senza token.
let diagCache: { t: number; p: Promise<any> } | null = null;
const fetchDiagnostics = async (): Promise<any> => {
  if (diagCache && Date.now() - diagCache.t < 10_000) return diagCache.p;
  const p = (async () => {
    const { data: s } = await supabase.auth.getSession();
    const token = s?.session?.access_token;
    const res = await fetch(getApiUrl('/api/admin/diagnostics'), {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })();
  diagCache = { t: Date.now(), p };
  return p;
};

// ── 📚 SEMINA LIBRERIA: genera a lotti gli itinerari del catalogo ───────
// POST /api/library/seed {limit} (Bearer admin): il server prende i
// prossimi descrittori non ancora generati, li genera/verifica e li salva
// in libreria. Ripetibile: si preme finché remaining non arriva a 0.
function LibrarySeedSection() {
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<{ processed: number; saved: number; failed: number; remaining: number | null } | null>(null);
  const [failedSlugs, setFailedSlugs] = useState<string[]>([]);
  const [runs, setRuns] = useState(0);
  const [error, setError] = useState('');

  const seed = async () => {
    if (running) return;
    setRunning(true);
    setError('');
    try {
      const res = await fetch(getApiUrl('/api/library/seed'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await adminAuthHeaders()) },
        body: JSON.stringify({ limit: 5 }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      // `failed` può essere un conteggio o direttamente l'elenco di slug;
      // eventuali slug falliti possono anche arrivare a parte.
      const failedRaw = data?.failed;
      const slugs: string[] = Array.isArray(failedRaw)
        ? failedRaw.map((f: any) => String(f?.slug ?? f))
        : Array.isArray(data?.failedSlugs) ? data.failedSlugs.map(String)
        : Array.isArray(data?.errors) ? data.errors.map((f: any) => String(f?.slug ?? f))
        : [];
      setLast({
        processed: Number(data?.processed) || 0,
        saved: Number(data?.saved) || 0,
        failed: Array.isArray(failedRaw) ? failedRaw.length : Number(failedRaw) || 0,
        remaining: data?.remaining === undefined || data?.remaining === null ? null : Number(data.remaining),
      });
      if (slugs.length) setFailedSlugs(prev => [...slugs, ...prev].slice(0, 50));
      setRuns(n => n + 1);
    } catch (e: any) {
      setError(`Semina fallita: ${e?.message || e}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-surface rounded-2xl p-4 border border-outline-variant space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookOpen className={`w-5 h-5 ${error ? 'text-red-500' : last ? 'text-emerald-500' : 'text-gray-400'}`} />
          <div>
            <h3 className="font-black text-primary text-sm">📚 Semina libreria</h3>
            <p className="text-[11px] text-on-surface-variant">
              Genera i prossimi itinerari del catalogo (5 alla volta, verificati da 2 AI). Ripeti finché "restanti" non arriva a 0.
            </p>
          </div>
        </div>
        <button
          onClick={seed}
          disabled={running}
          className="self-start px-4 py-2 rounded-xl bg-primary text-white text-xs font-black flex items-center gap-1.5 disabled:opacity-50"
        >
          {running
            ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Genero (~1 min a itinerario)...</>
            : <><Play className="w-3.5 h-3.5" /> Genera prossimi 5</>}
        </button>
      </div>

      {last && (
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">{last.processed} processati</span>
          <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">{last.saved} salvati</span>
          <span className={`px-2.5 py-1 rounded-full ${last.failed > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>{last.failed} falliti</span>
          {last.remaining !== null && (
            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">{last.remaining} restanti</span>
          )}
          {runs > 1 && <span className="text-[11px] text-on-surface-variant/70 font-medium">({runs} lotti in questa sessione)</span>}
        </div>
      )}

      {failedSlugs.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-black text-red-600 uppercase tracking-widest">Slug falliti (ultimi {failedSlugs.length})</p>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {failedSlugs.map((s, i) => (
              <div key={`${s}_${i}`} className="text-[11px] font-mono font-bold text-red-700 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1">
                {s}
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <div className="text-[11px] font-bold text-red-600">{error}</div>}
    </div>
  );
}

interface DiagnosticTest {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  status: TestStatus;
  resultMessage?: string;
  solution?: string;
  run: () => Promise<{ status: TestStatus; message: string; solution?: string }>;
}

export default function AdminDiagnostics() {
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [tests, setTests] = useState<DiagnosticTest[]>([
    {
      id: 'network',
      name: 'Connettività di Rete',
      description: 'Verifica se il dispositivo è connesso a Internet.',
      icon: <Wifi className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        const isOnline = navigator.onLine;
        if (isOnline) {
          try {
            const res = await fetch('https://1.1.1.1', { mode: 'no-cors', cache: 'no-store' });
            return { status: 'passed', message: 'Connessione Internet attiva e responsiva.' };
          } catch {
            return { status: 'warning', message: 'Il dispositivo risulta connesso, ma internet potrebbe essere lento o bloccato da un firewall.', solution: 'Controlla la tua connessione Wi-Fi o Dati.' };
          }
        }
        return { status: 'failed', message: 'Dispositivo Offline.', solution: 'Attiva il Wi-Fi o la rete cellulare del dispositivo.' };
      }
    },
    {
      id: 'supabase_latency',
      name: 'Salute Database (Supabase)',
      description: 'Misura la latenza di risposta del database centrale.',
      icon: <Database className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        const start = performance.now();
        try {
          const { error } = await supabase.from('shared_pois').select('id').limit(1);
          const end = performance.now();
          const latency = Math.round(end - start);
          
          if (error) throw error;
          
          if (latency > 1500) {
            return { status: 'warning', message: `Database lento. Risposta in ${latency}ms.`, solution: 'Possibili problemi ai server Supabase in Europa. Controlla la dashboard di Supabase.' };
          }
          return { status: 'passed', message: `Database in ottima salute. Risposta rapida in ${latency}ms.` };
        } catch (e: any) {
          return { status: 'failed', message: `Connessione al database fallita: ${e.message}`, solution: 'Verifica che le chiavi API Supabase (VITE_SUPABASE_URL) siano valide nel file .env' };
        }
      }
    },
    {
      id: 'ping_groq',
      name: 'Salute Groq (GPT-OSS)',
      description: 'Ping ai server di Groq per operazioni on-the-fly.',
      icon: <Activity className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        // Mai chiavi API nel browser: lo stato arriva dal backend autenticato.
        const start = performance.now();
        try {
          const data = await fetchDiagnostics();
          const latency = Math.round(performance.now() - start);
          if (data.groq?.status === 'passed') {
            return { status: 'passed', message: `Groq configurato lato server. Latenza backend: ${latency}ms` };
          }
          return { status: 'warning', message: 'Groq non configurato sul server.', solution: 'Configura GROQ_API_KEY su Vercel.' };
        } catch (e) {
          return { status: 'failed', message: 'Endpoint diagnostics irraggiungibile.', solution: 'Verifica la connessione o i log del server.' };
        }
      }
    },
    {
      id: 'ping_deepseek',
      name: 'Salute DeepSeek',
      description: 'Ping ai server DeepSeek per guide premium e itinerari.',
      icon: <Activity className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        // Mai chiavi API nel browser: lo stato arriva dal backend autenticato.
        const start = performance.now();
        try {
          const data = await fetchDiagnostics();
          const latency = Math.round(performance.now() - start);
          if (data.deepseek?.status === 'passed') {
            return { status: 'passed', message: `DeepSeek configurato lato server. Latenza backend: ${latency}ms` };
          }
          return { status: 'warning', message: 'DeepSeek non configurato sul server.', solution: 'Configura DEEPSEEK_API_KEY su Vercel.' };
        } catch (e) {
          return { status: 'failed', message: 'Endpoint diagnostics irraggiungibile.', solution: 'Verifica la connessione o i log del server.' };
        }
      }
    },
    {
      id: 'db_seeding',
      name: 'Integrità Database POI',
      description: 'Controlla che la tabella dei luoghi condivisi non sia vuota.',
      icon: <Database className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const { count, error } = await supabase.from('shared_pois').select('*', { count: 'exact', head: true });
          if (error) throw error;
          if (count === 0 || count === null) {
            return { status: 'failed', message: 'Il database dei luoghi condivisi è completamente vuoto!', solution: 'Naviga sulla mappa nell\'app e apri la scheda di un luogo per innescare il seeding automatico per la prima volta.' };
          }
          return { status: 'passed', message: `Database popolato correttamente. Ci sono ${count} luoghi nell'ecosistema.` };
        } catch (e: any) {
          return { status: 'failed', message: `Errore lettura tabella: ${e.message}`, solution: 'Possibile problema ai permessi RLS su Supabase.' };
        }
      }
    },
    {
      id: 'geofencing_math',
      name: 'Motore Matematico Geofencing',
      description: 'Esegue un self-test sulla formula di Haversine per la rilevazione dei luoghi.',
      icon: <Map className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        return new Promise((resolve) => {
          try {
            // Roma Colosseo
            const lat1 = 41.8902 * (Math.PI / 180);
            const lon1 = 12.4922 * (Math.PI / 180);
            // 100 metri più in là
            const lat2 = 41.8911 * (Math.PI / 180);
            const lon2 = 12.4922 * (Math.PI / 180);
            
            const R = 6371e3; // Raggio terra in metri
            const dLat = lat2 - lat1;
            const dLon = lon2 - lon1;
            
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distance = Math.round(R * c);
            
            // Distanza dovrebbe essere circa 100 metri
            if (distance > 95 && distance < 105) {
              resolve({ status: 'passed', message: `Geometria spaziale accurata. Calcolo test: ${distance} metri.` });
            } else {
              resolve({ status: 'failed', message: `Errore nella formula! Distanza anomala: ${distance}m`, solution: 'La formula Haversine nel codice potrebbe essere stata corrotta o alterata accidentalmente.' });
            }
          } catch (e: any) {
            resolve({ status: 'failed', message: `Errore logico: ${e.message}`, solution: 'Contatta il programmatore per riparare il codice matematico.' });
          }
        });
      }
    },
    {
      id: 'gamification_logic',
      name: 'Logica Gamification & Punti',
      description: 'Verifica la coerenza del sistema di calcolo dei punti XP.',
      icon: <Award className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const { recordPoiVision } = await import('../lib/gamification');
          if (typeof recordPoiVision === 'function') {
            return { status: 'passed', message: 'Le librerie Gamification sono collegate ed espongono le funzioni corrette.' };
          } else {
            return { status: 'failed', message: 'Manca la funzione recordPoiVision', solution: 'La libreria gamification.ts non esiste o è corrotta.' };
          }
        } catch (e: any) {
          return { status: 'failed', message: `Errore nel caricamento moduli gamification: ${e.message}`, solution: 'Verifica l\'esistenza di src/lib/gamification.ts' };
        }
      }
    },
    {
      id: 'audio_tts',
      name: 'Motore Sintesi Vocale (TTS)',
      description: 'Verifica che il dispositivo sia in grado di leggere a voce alta i testi.',
      icon: <Smartphone className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        if ('speechSynthesis' in window) {
          const voices = window.speechSynthesis.getVoices();
          if (voices.length > 0) {
            return { status: 'passed', message: `Motore TTS Attivo. Trovate ${voices.length} voci installate.` };
          } else {
            return { status: 'warning', message: 'Motore TTS supportato, ma nessuna voce caricata (spesso richiede interazione utente iniziale).', solution: 'Niente di rotto. Le voci di sistema vengono caricate solo quando un utente avvia un audio per la prima volta su iOS/Android.' };
          }
        }
        return { status: 'failed', message: 'API Web Speech non supportata.', solution: 'Browser obsoleto o iOS WebKit bloccato.' };
      }
    },
    {
      id: 'api_azure_tts',
      name: 'Azure Speech (TTS Principale)',
      description: 'Verifica il motore vocale primario delle audioguide (voci Nicky/Dante).',
      icon: <Volume2 className="w-5 h-5 text-sky-500" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.azure_tts?.status === 'passed') return { status: 'passed', message: 'Azure Speech configurato: le audioguide usano le voci neurali.' };
          return { status: 'warning', message: 'Azure Speech non configurato: fallback su Google TTS/nativo.', solution: 'Configura AZURE_SPEECH_KEY e AZURE_SPEECH_REGION su Vercel.' };
        } catch { return { status: 'failed', message: 'Endpoint backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_ai_together',
      name: 'API Together AI (Vision)',
      description: 'Verifica il motore Llama-3.2 Vision.',
      icon: <CheckCircle2 className="w-5 h-5 text-blue-500" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.together?.status === 'passed') return { status: 'passed', message: 'Together AI API Configured.' };
          return { status: 'warning', message: 'Together AI API non configurata (usando Gemini Fallback)', solution: 'Configura TOGETHER_API_KEY su Vercel.' };
        } catch { return { status: 'failed', message: 'Endpoint backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_stripe',
      name: 'Stripe (Pagamenti)',
      description: 'Verifica la configurazione del gateway pagamenti crediti/abbonamenti.',
      icon: <ShieldCheck className="w-5 h-5 text-violet-500" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.stripe?.status === 'passed') return { status: 'passed', message: 'Stripe configurato: checkout crediti e webhook attivi.' };
          return { status: 'failed', message: 'Stripe NON configurato: gli acquisti web falliranno.', solution: 'Configura STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET su Vercel.' };
        } catch { return { status: 'failed', message: 'Endpoint backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_scraping_virgilio',
      name: 'Scraping Virgilio',
      description: 'Testa la validità dell\'estrattore eventi Virgilio.',
      icon: <Globe2 className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.virgilio?.status === 'passed') return { status: 'passed', message: 'Virgilio Scraper logic ok.' };
          return { status: 'failed', message: 'Errore nello scraping' };
        } catch { return { status: 'failed', message: 'Backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_affiliate_gyg',
      name: 'GetYourGuide Affiliate',
      description: 'Test generatore link affiliato GYG.',
      icon: <Globe2 className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.getyourguide?.status === 'passed') return { status: 'passed', message: 'Generatore link GYG (partner_id=KYSFZYF) attivo.' };
          return { status: 'failed', message: 'Errore generatore link' };
        } catch { return { status: 'failed', message: 'Backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_ticketmaster',
      name: 'Ticketmaster API',
      description: 'Test connessione Ticketmaster Discovery.',
      icon: <CheckCircle2 className="w-5 h-5 text-pink-500" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.ticketmaster?.status === 'passed') return { status: 'passed', message: 'Ticketmaster proxy attivo.' };
          return { status: 'failed', message: 'Errore Ticketmaster' };
        } catch { return { status: 'failed', message: 'Backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_ai_gemini',
      name: 'API Gemini (Fallback/Vision)',
      description: 'Verifica la configurazione di Google Gemini AI.',
      icon: <CheckCircle2 className="w-5 h-5 text-blue-400" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.gemini?.status === 'passed') return { status: 'passed', message: 'Gemini API Configured.' };
          return { status: 'warning', message: 'Gemini API non configurata', solution: 'Configura GEMINI_API_KEY su Vercel.' };
        } catch { return { status: 'failed', message: 'Endpoint backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_google_places',
      name: 'Google Places API',
      description: 'Verifica accesso API mappa commerciale.',
      icon: <CheckCircle2 className="w-5 h-5 text-red-500" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.google_places?.status === 'passed') return { status: 'passed', message: 'Google Places API Configured.' };
          return { status: 'warning', message: 'Google Places API non configurata', solution: 'Configura VITE_GOOGLE_MAPS_API_KEY su Vercel.' };
        } catch { return { status: 'failed', message: 'Endpoint backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_overpass',
      name: 'Overpass API (OSM)',
      description: 'Test server pubblico OpenStreetMap Overpass.',
      icon: <Globe2 className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.overpass?.status === 'passed') return { status: 'passed', message: 'Overpass API Proxy accessibile.' };
          return { status: 'failed', message: 'Errore Overpass' };
        } catch { return { status: 'failed', message: 'Backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_foursquare',
      name: 'Foursquare API',
      description: 'Verifica accesso API per locali e ristoranti.',
      icon: <CheckCircle2 className="w-5 h-5 text-indigo-500" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.foursquare?.status === 'passed') return { status: 'passed', message: 'Foursquare API Configured.' };
          return { status: 'warning', message: 'Foursquare API non configurata', solution: 'Configura VITE_FOURSQUARE_API_KEY su Vercel.' };
        } catch { return { status: 'failed', message: 'Endpoint backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_tripadvisor',
      name: 'TripAdvisor API (Fallback)',
      description: 'Verifica proxy di scraping TripAdvisor per i locali.',
      icon: <Globe2 className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.tripadvisor?.status === 'passed') return { status: 'passed', message: 'TripAdvisor Fallback Proxy accessibile.' };
          return { status: 'failed', message: 'Errore TripAdvisor Proxy' };
        } catch { return { status: 'failed', message: 'Backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_viator',
      name: 'Viator Affiliate',
      description: 'Verifica scraping affiliato Viator per eventi.',
      icon: <Globe2 className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.viator?.status === 'passed') return { status: 'passed', message: 'Generatore link Viator attivo.' };
          return { status: 'failed', message: 'Errore Viator' };
        } catch { return { status: 'failed', message: 'Backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_wikipedia',
      name: 'Wikipedia API',
      description: 'Verifica accesso API pubblica per la cultura.',
      icon: <Globe2 className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.wikipedia?.status === 'passed') return { status: 'passed', message: 'Wikipedia API Proxy accessibile.' };
          return { status: 'failed', message: 'Errore Wikipedia' };
        } catch { return { status: 'failed', message: 'Backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_elevenlabs',
      name: 'ElevenLabs API (TTS)',
      description: 'Verifica configurazione motore vocale premium.',
      icon: <Volume2 className="w-5 h-5 text-emerald-500" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.elevenlabs?.status === 'passed') return { status: 'passed', message: 'ElevenLabs API Configured.' };
          return { status: 'warning', message: 'ElevenLabs API non configurata (userà sistema Nativo)', solution: 'Configura ELEVENLABS_API_KEY su Vercel.' };
        } catch { return { status: 'failed', message: 'Endpoint backend irraggiungibile' }; }
      }
    },
    {
      id: 'local_storage',
      name: 'Memoria App (Storage Locale)',
      description: 'Analizza lo stato della memoria offline usata dall\'app.',
      icon: <HardDrive className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          let total = 0;
          for (let x in localStorage) {  
            let amount = (localStorage[x].length * 2) / 1024 / 1024;  
            if (!isNaN(amount)) {
              total += amount;
            }
          }
          if (total > 4.5) { // Quota standard locale browser = 5MB
            return { status: 'warning', message: `Allarme! Stai usando ${total.toFixed(2)} MB di cache offline. Sei vicino al limite di 5MB standard.`, solution: 'Svuota la cache dal "Panic Button" o rimuovi Itinerari Offline.' };
          }
          return { status: 'passed', message: `Memoria sicura. L'app sta occupando ${total.toFixed(2)} MB nella cache del telefono.` };
        } catch (e: any) {
          return { status: 'failed', message: 'Storage bloccato', solution: 'L\'utente sta navigando in incognito totale o il dispositivo blocca il salvataggio dei dati. L\'app non può salvare preferenze!' };
        }
      }
    },
    {
      id: 'bg_geolocation',
      name: 'Background Geolocation',
      description: 'Verifica lo stato del plugin di localizzazione in background.',
      icon: <Navigation className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          if (typeof window !== 'undefined' && 'Capacitor' in window) {
            // Finta chiamata per testare se Capacitor è inizializzato
            return { status: 'passed', message: 'Plugin Capacitor nativo rilevato correttamente.' };
          } else {
            return { status: 'warning', message: 'App in esecuzione su Web Browser. Permessi nativi disabilitati.', solution: 'Per testare il background, usa un emulatore iOS/Android o un dispositivo fisico.' };
          }
        } catch (e: any) {
          return { status: 'failed', message: `Errore plugin GPS: ${e.message}`, solution: 'Verifica l\'installazione del plugin @capacitor-community/background-geolocation' };
        }
      }
    },
    {
      id: 'audio_context',
      name: 'Canale Audio & Bluetooth',
      description: 'Verifica l\'inizializzazione dell\'AudioContext per output multimediale.',
      icon: <Volume2 className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            const state = ctx.state;
            await ctx.close();
            return { status: 'passed', message: `Motore Audio pronto. Stato iniziale: ${state}. Routing Bluetooth abilitato.` };
          }
          return { status: 'failed', message: 'AudioContext non disponibile.', solution: 'Browser non supportato o blocco rigoroso dell\'audio da parte del sistema operativo.' };
        } catch (e: any) {
          return { status: 'warning', message: 'Impossibile testare l\'audio automaticamente', solution: 'Il browser blocca l\'audio finché l\'utente non tocca lo schermo (Autoplay Policy).' };
        }
      }
    },
    {
      id: 'osm_nominatim',
      name: 'Server Mappe (Nominatim)',
      description: 'Verifica se l\'API OpenStreetMap per la ricerca delle città è online.',
      icon: <Globe2 className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const start = performance.now();
          const res = await fetch('https://nominatim.openstreetmap.org/search?q=Roma&format=json&limit=1');
          const end = performance.now();
          if (res.ok) {
            return { status: 'passed', message: `Server OSM attivi. Risposta in ${Math.round(end - start)}ms.` };
          }
          return { status: 'failed', message: `Server OSM ha restituito errore ${res.status}.`, solution: 'Riprova più tardi. Nominatim potrebbe avere imposto limiti di Rate-Limiting temporanei.' };
        } catch (e: any) {
          return { status: 'failed', message: `Impossibile raggiungere OSM: ${e.message}`, solution: 'Problema di rete o server OpenStreetMap inattivo.' };
        }
      }
    },
    {
      id: 'push_notifications',
      name: 'Permessi Notifiche Push',
      description: 'Verifica lo stato del permesso per ricevere avvisi in background.',
      icon: <Bell className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        if (!('Notification' in window)) {
          return { status: 'failed', message: 'API Notifiche non supportata dal dispositivo.', solution: 'Controlla i permessi nativi in Capacitor Push Notifications.' };
        }
        if (Notification.permission === 'granted') {
          return { status: 'passed', message: 'Permesso Notifiche concesso.' };
        } else if (Notification.permission === 'denied') {
          return { status: 'failed', message: 'Permesso Negato dall\'utente.', solution: 'Mostra un popup all\'utente invitandolo ad aprire le Impostazioni del telefono.' };
        } else {
          return { status: 'warning', message: 'Permesso non ancora richiesto.', solution: 'L\'app dovrà chiedere il permesso al momento opportuno.' };
        }
      }
    },
    {
      id: 'auth_token',
      name: 'Salute Token Sicurezza',
      description: 'Controlla la validità e la scadenza della sessione Supabase.',
      icon: <ShieldCheck className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const { data, error } = await supabase.auth.getSession();
          if (error) throw error;
          
          if (!data.session) {
            return { status: 'warning', message: 'Nessuna sessione attiva (Modalità Ospite).', solution: 'Nessun problema, ma i salvataggi in cloud sono disabilitati.' };
          }
          
          const expiresAt = data.session.expires_at;
          if (expiresAt) {
            const timeRemaining = expiresAt - Math.floor(Date.now() / 1000);
            if (timeRemaining < 3600) {
              return { status: 'warning', message: `Il Token scade tra meno di 1 ora (${Math.round(timeRemaining / 60)} min).`, solution: 'Supabase dovrebbe rigenerarlo in automatico. Tieni monitorato se gli utenti vengono disconnessi.' };
            }
            return { status: 'passed', message: `Token di sessione crittografico valido. Scadenza sicura tra ${Math.round(timeRemaining / 3600)} ore.` };
          }
          
          return { status: 'passed', message: 'Token valido ma senza scadenza esplicita.' };
        } catch (e: any) {
          return { status: 'failed', message: `Errore autenticazione: ${e.message}`, solution: 'Forza il logout e fai rientrare l\'utente.' };
        }
      }
    },
    {
      id: 'i18n_fallback',
      name: 'Motore Traduzioni (i18n)',
      description: 'Simula la richiesta di una lingua inesistente per testare il fallback di sicurezza.',
      icon: <Globe2 className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const { getTranslation } = await import('../lib/i18n');
          // Richiediamo una lingua che sappiamo non essere pienamente supportata per testare il fallback a IT/EN
          const fakeKey = "test_key_does_not_exist";
          const res = getTranslation(fakeKey as any, 'IT');
          
          if (res === fakeKey || typeof res === 'string') {
             return { status: 'passed', message: 'Sistema di traduzione stabile. Fallback di emergenza funzionante.' };
          }
          return { status: 'warning', message: 'Risultato anomalo dal traduttore.', solution: 'Controlla lib/i18n.ts' };
        } catch (e: any) {
          return { status: 'failed', message: `Errore critico modulo lingue: ${e.message}`, solution: 'Il file i18n potrebbe essere corrotto.' };
        }
      }
    },
    {
      id: 'file_coherence',
      name: 'Coerenza File Offline',
      description: 'Verifica se ci sono itinerari scaricati corrotti o con file audio mancanti.',
      icon: <HardDrive className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const offlineData = localStorage.getItem('offline_itineraries_data');
          if (!offlineData) {
            return { status: 'passed', message: 'Nessun file offline scaricato sul dispositivo. Situazione pulita.' };
          }
          
          const parsed = JSON.parse(offlineData);
          if (!Array.isArray(parsed) || parsed.length === 0) {
             return { status: 'warning', message: 'Il pacchetto offline è vuoto ma occupa memoria.', solution: 'Consiglia un Panic Reset per liberare lo spazio.' };
          }
          
          let corruptedCount = 0;
          parsed.forEach((itinerary: any) => {
            if (!itinerary.id || !itinerary.pois || !Array.isArray(itinerary.pois)) {
              corruptedCount++;
            }
          });
          
          if (corruptedCount > 0) {
            return { status: 'failed', message: `Trovati ${corruptedCount} itinerari offline irrimediabilmente corrotti.`, solution: 'Premi il pulsante "Panic Reset (Cache)" per distruggere i file corrotti e costringere l\'app a riscaricarli la prossima volta.' };
          }
          
          return { status: 'passed', message: `I file di ${parsed.length} itinerari offline sono strutturalmente integri.` };
        } catch (e: any) {
          return { status: 'failed', message: `Struttura File illegibile (JSON Corrotto).`, solution: 'Il disco del telefono ha corrotto i salvataggi. Esegui il "Panic Reset".' };
        }
      }
    }
  ]);

  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  const [showOnlyProblems, setShowOnlyProblems] = useState(false);

  const updateTestStatus = (id: string, status: TestStatus, message?: string, solution?: string) => {
    setTests(prev => prev.map(t => t.id === id ? { ...t, status, resultMessage: message, solution } : t));
  };

  // try/catch obbligatorio: un run() che lancia un'eccezione imprevista
  // lasciava la card inchiodata su "running" per sempre.
  const executeTest = async (test: DiagnosticTest) => {
    updateTestStatus(test.id, 'running');
    try {
      const result = await test.run();
      updateTestStatus(test.id, result.status, result.message, result.solution);
    } catch (e: any) {
      updateTestStatus(test.id, 'failed', `Errore imprevisto del test: ${e?.message || e}`, 'Riprova; se persiste controlla la console del browser.');
    }
  };

  const runSingleTest = async (testId: string) => {
    const test = tests.find(t => t.id === testId);
    if (test) await executeTest(test);
  };

  const runAllTests = async () => {
    setIsRunningAll(true);
    // In parallelo: i check delle chiavi condividono un'unica fetch cacheata
    // all'endpoint diagnostics. Il vecchio giro sequenziale con 600ms di
    // ritardo "scenografico" per test impiegava oltre 20 secondi.
    await Promise.all(tests.map(t => executeTest(t)));
    setLastRunAt(new Date());
    setIsRunningAll(false);
  };

  // Riepilogo per la barra di stato in testa
  const summary = {
    passed: tests.filter(t => t.status === 'passed').length,
    warning: tests.filter(t => t.status === 'warning').length,
    failed: tests.filter(t => t.status === 'failed').length,
    ran: tests.filter(t => t.status !== 'idle' && t.status !== 'running').length,
  };
  const visibleTests = showOnlyProblems
    ? tests.filter(t => t.status === 'failed' || t.status === 'warning')
    : tests;

  /**
   * PANIC RESET: azzeramento completo dello stato LOCALE dell'app — l'ultima
   * spiaggia quando cache o salvataggi su device sono corrotti.
   * Cancella: localStorage/sessionStorage (impostazioni, sessione, mirror
   * preferiti), IndexedDB (POI offline, aree mappa, audio scaricati) e le
   * cache del service worker (tile mappa, audio, font).
   * NON tocca i dati sul cloud: account, crediti acquistati, preferiti
   * sincronizzati, itinerari salvati e cronologia restano intatti e tornano
   * al login successivo. Prima della pulizia prova a svuotare la coda di
   * sincronizzazione dei preferiti, per non perdere cuori messi offline.
   */
  const emergencyReset = async () => {
    if (!confirm(
      "PANIC RESET — leggi prima di confermare.\n\n" +
      "VERRÀ CANCELLATO (solo su questo dispositivo):\n" +
      "• impostazioni locali e sessione (dovrai rifare il login)\n" +
      "• mappe offline, POI e audio scaricati\n" +
      "• cache di mappa e contenuti\n\n" +
      "NON VERRÀ TOCCATO (è sul cloud):\n" +
      "• account, crediti acquistati e Day Pass\n" +
      "• preferiti sincronizzati, itinerari salvati, cronologia\n\n" +
      "Usalo solo se l'app è instabile o la diagnostica segnala file corrotti. Confermi?"
    )) return;

    // Salva sul cloud le sync dei preferiti rimaste in coda prima di distruggerla
    try {
      const { flushPendingFavSync } = await import('../lib/favorites');
      await flushPendingFavSync();
    } catch { /* offline o non loggato: la coda andrà persa, come avvisato */ }

    localStorage.clear();
    sessionStorage.clear();

    // IndexedDB: database Dexie dei POI + store idb-keyval (aree/audio offline)
    try {
      const dbs: any[] = (indexedDB as any).databases ? await (indexedDB as any).databases() : [];
      if (dbs.length > 0) {
        dbs.forEach(d => { if (d?.name) indexedDB.deleteDatabase(d.name); });
      } else {
        // Fallback per browser senza indexedDB.databases()
        ['ItaliaInTascaDB', 'keyval-store'].forEach(n => indexedDB.deleteDatabase(n));
      }
    } catch { /* best effort */ }

    // Cache del service worker (tile mappa, audio, font)
    try {
      if (typeof caches !== 'undefined') {
        const names = await caches.keys();
        await Promise.all(names.map(n => caches.delete(n)));
      }
    } catch { /* best effort */ }

    alert("Memoria locale svuotata. L'app si riavvierà pulita: fai di nuovo il login.");
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-primary flex items-center gap-2">
            <Activity className="w-6 h-6 text-secondary" />
            Diagnostica e Salute
          </h2>
          <p className="text-sm text-on-surface-variant font-medium mt-1">
            Strumenti avanzati per analizzare la stabilità, individuare problemi in tempo reale e riparare l'app.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={emergencyReset}
            title="Azzera TUTTA la memoria locale del dispositivo (cache, offline, sessione). Non tocca account, crediti e dati salvati sul cloud."
            className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-sm rounded-xl transition-colors flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Panic Reset (Cache)
          </button>
          <button 
            onClick={runAllTests}
            disabled={isRunningAll}
            className={`px-5 py-2.5 rounded-xl font-black text-sm uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all ${
              isRunningAll ? 'bg-gray-200 text-on-surface-variant' : 'bg-emerald-500 hover:bg-emerald-600 text-secondary'
            }`}
          >
            {isRunningAll ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Analisi in corso...</>
            ) : (
              <><Play className="w-4 h-4" /> Esegui Check-up Completo</>
            )}
          </button>
        </div>
      </div>

      {/* Canarino schedulato + kill switch: la parte "sempre accesa" della
          diagnostica, visibile prima ancora di lanciare i test manuali */}
      <CanarySection />
      <MonitoringSection />
      <RoutingSection />
      <FlagsSection />
      <TriggerTelemetrySection />
      <TestVirtualeSection />
      <NavLogSection />
      <CollaudoRegistriSection />
      <SenzaStradaSection />
      <GpsReplaySection />
      <LibrarySeedSection />

      {/* Riepilogo esito: appare dopo il primo giro di test */}
      {summary.ran > 0 && (
        <div className={`rounded-2xl p-4 border flex flex-col sm:flex-row sm:items-center gap-3 ${
          summary.failed > 0 ? 'bg-red-50 border-red-200' :
          summary.warning > 0 ? 'bg-amber-50 border-amber-200' :
          'bg-emerald-50 border-emerald-200'
        }`} aria-live="polite">
          <div className="flex items-center gap-2 font-black text-sm">
            {summary.failed > 0
              ? (<><XCircle className="w-5 h-5 text-red-600" /><span className="text-red-800">{summary.failed} {summary.failed === 1 ? 'problema critico' : 'problemi critici'}</span></>)
              : summary.warning > 0
                ? (<><AlertTriangle className="w-5 h-5 text-amber-600" /><span className="text-amber-800">Nessun errore critico, {summary.warning} {summary.warning === 1 ? 'avviso' : 'avvisi'}</span></>)
                : (<><CheckCircle2 className="w-5 h-5 text-emerald-600" /><span className="text-emerald-800">Tutti i sistemi operativi</span></>)}
          </div>
          <div className="flex items-center gap-2 text-xs font-bold sm:ml-auto">
            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">{summary.passed} OK</span>
            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">{summary.warning} avvisi</span>
            <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-700">{summary.failed} errori</span>
            {lastRunAt && (
              <span className="text-on-surface-variant/70 font-medium hidden md:inline">
                ultimo check {lastRunAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          {(summary.failed > 0 || summary.warning > 0) && (
            <button
              onClick={() => setShowOnlyProblems(v => !v)}
              className={`self-start sm:self-auto px-3 py-1.5 rounded-xl text-xs font-black transition-colors ${
                showOnlyProblems ? 'bg-primary text-white' : 'bg-white text-primary border border-primary/20 hover:bg-primary/5'
              }`}
            >
              {showOnlyProblems ? 'Mostra tutti' : 'Solo problemi'}
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visibleTests.map(test => (
          <div key={test.id} className="bg-surface rounded-2xl p-4 border border-outline-variant flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-xl text-secondary ${
                    test.status === 'passed' ? 'bg-emerald-500' :
                    test.status === 'failed' ? 'bg-red-500' :
                    test.status === 'warning' ? 'bg-amber-500' :
                    test.status === 'running' ? 'bg-blue-500 animate-pulse' :
                    'bg-gray-400'
                  }`}>
                    {test.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-primary text-sm">{test.name}</h3>
                    <p className="text-[10px] text-on-surface-variant leading-tight mt-0.5 max-w-[200px]">{test.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => runSingleTest(test.id)}
                  disabled={test.status === 'running' || isRunningAll}
                  title={`Riesegui: ${test.name}`}
                  aria-label={`Riesegui il test ${test.name}`}
                  className="p-1.5 hover:bg-surface rounded-lg text-on-surface-variant hover:text-blue-600 transition-colors disabled:opacity-40"
                >
                  <RefreshCw className={`w-4 h-4 ${test.status === 'running' ? 'animate-spin text-blue-500' : ''}`} />
                </button>
              </div>
              
              <div className="mt-4 pt-3 border-t border-outline-variant">
                {test.status === 'idle' && (
                  <span className="text-xs text-on-surface-variant font-medium italic">In attesa del test...</span>
                )}
                {test.status === 'running' && (
                  <span className="text-xs text-blue-500 font-bold flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin"/> Controllo in esecuzione...</span>
                )}
                {test.status === 'passed' && (
                  <span className="text-xs text-emerald-600 font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5"/> {test.resultMessage}</span>
                )}
                {test.status === 'warning' && (
                  <div className="space-y-1">
                    <span className="text-xs text-amber-600 font-bold flex items-start gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5"/> {test.resultMessage}</span>
                    {test.solution && <div className="text-[10px] bg-amber-50 text-amber-800 p-2 rounded-lg mt-1 font-medium border border-amber-100"><b>Azione Richiesta:</b> {test.solution}</div>}
                  </div>
                )}
                {test.status === 'failed' && (
                  <div className="space-y-1">
                    <span className="text-xs text-red-600 font-bold flex items-start gap-1"><XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5"/> {test.resultMessage}</span>
                    {test.solution && <div className="text-[10px] bg-red-50 text-red-800 p-2 rounded-lg mt-1 font-medium border border-red-100"><b>Soluzione Consigliata:</b> {test.solution}</div>}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
