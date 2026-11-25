// @ts-nocheck
// REPORT «LAVORI IN BACK» (20/11/2026, committente: «tutte le mattine lo metti nella cartella i miei download, tab admin,
// cartella Report, sottocartella LAVORI IN BACK; ogni giorno aggiorni il file e lasci i giorni precedenti; anche un tasto
// aggiorna se volessi averlo aggiornato in ogni momento del giorno»).
// Il report lo scrive Oracle (`/root/report-lavori/report-lavori.mjs`) in api_cache, uno per giorno: qui si leggono con
// GET /api/admin/report-lavori e il tasto «Aggiorna ora» chiede a Oracle di rifare quello di oggi (entro un minuto).
import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, FileText, ChevronLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getApiUrl } from '../../lib/api';

const fmt = (v: any) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('it-IT'));
const pct = (a: any, b: any) => (Number(b) > 0 ? `${((100 * Number(a)) / Number(b)).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%` : '');
const giornoIt = (g: string) => { const [y, m, d] = String(g || '').split('-'); return d ? `${d}/${m}/${y}` : g; };

async function intestazione() {
  const { data: s } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${s?.session?.access_token || ''}` };
}

export default function ReportLavori() {
  const [stato, setStato] = useState<{ report: any[]; richiesta: any; errore?: string } | null>(null);
  const [aperto, setAperto] = useState<string | null>(null);
  const [attesa, setAttesa] = useState<number | null>(null); // istante della richiesta di aggiornamento in corso
  const timer = useRef<any>(null);

  const carica = async () => {
    try {
      const r = await fetch(getApiUrl('/api/admin/report-lavori'), { headers: await intestazione() });
      const j = await r.json().catch(() => ({}));
      const s = r.ok ? { report: j.report || [], richiesta: j.richiesta || null } : { report: [], richiesta: null, errore: j.error || `HTTP ${r.status}` };
      setStato(s);
      return s;
    } catch (e: any) { const s = { report: [], richiesta: null, errore: e?.message || 'rete' }; setStato(s); return s; }
  };
  useEffect(() => { void carica(); return () => clearTimeout(timer.current); }, []);

  const aggiorna = async () => {
    try {
      const r = await fetch(getApiUrl('/api/admin/report-lavori/aggiorna'), { method: 'POST', headers: await intestazione() });
      if (!r.ok) { setStato(s => ({ ...(s || { report: [], richiesta: null }), errore: `Aggiornamento non chiesto (HTTP ${r.status})` })); return; }
      const t0 = Date.now();
      setAttesa(t0);
      // Oracle guarda la richiesta ogni minuto e il report richiede circa un minuto: si ricontrolla ogni 15 s per 4 minuti.
      const giro = async (n: number) => {
        const s = await carica();
        const ultimo = s?.report?.[0];
        if (ultimo && Number(ultimo.t) >= t0) { setAttesa(null); setAperto(ultimo.giorno); return; }
        if (n >= 16) { setAttesa(null); setStato(x => ({ ...(x || { report: [], richiesta: null }), errore: 'Oracle non ha ancora risposto: riprova fra qualche minuto.' })); return; }
        timer.current = setTimeout(() => giro(n + 1), 15000);
      };
      timer.current = setTimeout(() => giro(1), 15000);
    } catch (e: any) { setStato(s => ({ ...(s || { report: [], richiesta: null }), errore: e?.message || 'rete' })); }
  };

  const rep = stato?.report?.find((x: any) => x.giorno === aperto) || null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[12px] font-bold text-on-surface-variant/70">Ogni mattina alle 7:00 un report nuovo; i giorni precedenti restano.</p>
        <button
          onClick={() => void aggiorna()}
          disabled={attesa !== null}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-primary text-white text-[12px] font-black disabled:opacity-60 shrink-0"
        ><RefreshCw size={14} className={attesa !== null ? 'animate-spin' : ''} /> {attesa !== null ? 'Aggiorno…' : 'Aggiorna ora'}</button>
      </div>
      {stato === null && <p className="text-sm font-bold text-on-surface-variant/60 px-1">…</p>}
      {stato?.errore && <p className="text-sm font-bold text-red-700 px-1">{stato.errore}</p>}
      {stato && !stato.errore && stato.report.length === 0 && <p className="text-sm font-bold text-on-surface-variant/60 px-1">Nessun report ancora: il primo arriva domattina alle 7:00, oppure premi «Aggiorna ora».</p>}

      {!rep && stato?.report?.map((r: any) => (
        <button key={r.giorno} onClick={() => setAperto(r.giorno)}
          className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-outline-variant/10 shadow-sm text-left hover:bg-primary/5">
          <div className="grid place-items-center w-10 h-10 rounded-xl bg-amber-100 text-amber-800 shrink-0"><FileText size={18} /></div>
          <div className="min-w-0">
            <p className="text-sm font-black text-on-surface">Lavori in back · {giornoIt(r.giorno)}</p>
            <p className="text-[11px] font-bold text-on-surface-variant/60">aggiornato alle {r.ora}{Array.isArray(r.allarmi) && r.allarmi.length ? ` · ${r.allarmi.length} da guardare` : ''}</p>
          </div>
        </button>
      ))}

      {rep && (
        <div className="space-y-4">
          <button onClick={() => setAperto(null)} className="inline-flex items-center gap-1 text-primary text-[12px] font-black"><ChevronLeft size={14} /> Tutti i giorni</button>
          <div className="px-1">
            <h4 className="text-base font-black text-on-surface">Lavori in back · {giornoIt(rep.giorno)}</h4>
            <p className="text-[11px] font-bold text-on-surface-variant/60">Letto dal server Oracle alle {rep.ora} (ora italiana)</p>
          </div>

          {Array.isArray(rep.allarmi) && rep.allarmi.length > 0 && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 space-y-1">
              {rep.allarmi.map((a: string, i: number) => <p key={i} className="text-[12px] font-bold text-red-800">⚠ {a}</p>)}
            </div>
          )}

          <div className="space-y-2">
            {(rep.lavori || []).map((l: any) => {
              const p = Number(l.totale) > 0 ? Math.min(100, (100 * Number(l.fatti)) / Number(l.totale)) : null;
              return (
                <div key={l.id} className="rounded-2xl bg-white border border-outline-variant/10 shadow-sm p-3.5 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-black text-on-surface">{l.lavoro}</p>
                    <span className={`text-[11px] font-black ${l.attivo === false ? 'text-red-700' : 'text-green-700'}`}>{l.attivo === false ? 'FERMO' : 'ATTIVO'}</span>
                  </div>
                  <p className="text-[13px] font-bold text-on-surface tabular-nums">
                    {fmt(l.fatti)}{l.totale ? ` su ${fmt(l.totale)}` : ''} {l.unita || ''}{p !== null ? ` · ${pct(l.fatti, l.totale)}` : ''}
                  </p>
                  {p !== null && <div className="h-1.5 rounded-full bg-primary/10 overflow-hidden"><div className="h-full bg-primary" style={{ width: `${p}%` }} /></div>}
                  {l.ritmo && <p className="text-[11px] font-bold text-on-surface-variant/70">Ritmo: {l.ritmo}</p>}
                  {l.nota && <p className="text-[11px] text-on-surface-variant/70">{l.nota}</p>}
                </div>
              );
            })}
          </div>

          {Array.isArray(rep.seedGiorni) && rep.seedGiorni.length > 0 && (
            <div className="rounded-2xl bg-white border border-outline-variant/10 shadow-sm p-3.5 space-y-2">
              <p className="text-sm font-black text-on-surface">Itinerari salvati in libreria, per giorno</p>
              {(() => { const max = Math.max(...rep.seedGiorni.map((g: any) => Number(g.salvati) || 0), 1); return rep.seedGiorni.map((g: any) => (
                <div key={g.giorno} className="flex items-center gap-2 text-[11px] font-bold tabular-nums">
                  <span className="w-12 text-on-surface-variant/70">{giornoIt(g.giorno).slice(0, 5)}</span>
                  <div className="flex-1 h-3 rounded bg-primary/10 overflow-hidden"><div className="h-full bg-primary" style={{ width: `${(100 * Number(g.salvati)) / max}%` }} /></div>
                  <span className="w-10 text-right">{fmt(g.salvati)}</span>
                </div>
              )); })()}
            </div>
          )}

          {Array.isArray(rep.lingue) && rep.lingue.length > 0 && (
            <div className="rounded-2xl bg-white border border-outline-variant/10 shadow-sm p-3.5 space-y-2">
              <p className="text-sm font-black text-on-surface">Guide museo in libreria, per lingua</p>
              <div className="grid grid-cols-4 gap-2">
                {rep.lingue.map((x: any) => (
                  <div key={x.lingua} className="rounded-xl bg-primary/5 p-2 text-center">
                    <p className="text-[10px] font-black text-on-surface-variant/70">{x.lingua}</p>
                    <p className="text-[13px] font-black tabular-nums">{fmt(x.guide)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Array.isArray(rep.righe) && rep.righe.length > 0 && (
            <div className="rounded-2xl bg-white border border-outline-variant/10 shadow-sm p-3.5 space-y-1">
              <p className="text-sm font-black text-on-surface">Altro</p>
              {rep.righe.map((x: string, i: number) => <p key={i} className="text-[12px] text-on-surface-variant/80">{x}</p>)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
