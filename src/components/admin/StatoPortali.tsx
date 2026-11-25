// PORTALI E PARTNER PER PAESE (25/11/2026, committente: «la lista di tutti i partner/portali divisi per paese, con una
// X rossa se non funzionano o V verde se funzionano, nella tab test»). Legge dalla riga della notte:
// - `moduli.stato_portali.notte.sezione.righe` (modulo-stato-portali su Oracle: ogni portale del registro
//   src/data/fontiEventi.ts provato su una città vera del suo paese, senza AI);
// - `report_partner.partner` (Viator, GetYourGuide, Tiqets, Klook, Trip.com, Ticketmaster: V se voto ≥ 7).
import React, { useMemo, useState } from 'react';

const NOMI_PARTNER: Record<string, string> = { viator: 'Viator', getyourguide: 'GetYourGuide', tiqets: 'Tiqets', klook: 'Klook', tripcom: 'Trip.com', ticketmaster: 'Ticketmaster' };
const Segno: React.FC<{ ok: boolean | null }> = ({ ok }) => ok === true
  ? <span className="inline-grid place-items-center w-6 h-6 rounded-lg bg-green-100 text-green-700 font-black text-sm">V</span>
  : ok === false ? <span className="inline-grid place-items-center w-6 h-6 rounded-lg bg-red-100 text-red-700 font-black text-sm">X</span>
  : <span className="inline-grid place-items-center w-6 h-6 rounded-lg bg-surface-variant text-on-surface-variant font-black text-sm">–</span>;

const StatoPortali: React.FC<{ notti: any[] }> = ({ notti }) => {
  const con = (notti || []).filter((n) => n?.moduli?.stato_portali?.notte?.sezione?.righe || n?.report_partner?.partner);
  const [scelta, setScelta] = useState(0);
  const [soloKo, setSoloKo] = useState(false);
  const n = con[Math.min(scelta, Math.max(0, con.length - 1))];
  const gruppi = useMemo(() => {
    const righe: any[] = n?.moduli?.stato_portali?.notte?.sezione?.righe || [];
    const g: Record<string, any[]> = {};
    for (const r of righe) (g[r.paese === '*' ? 'Mondiali' : r.paese] ||= []).push(r);
    return Object.entries(g).sort(([a], [b]) => (a === 'Mondiali' ? -1 : b === 'Mondiali' ? 1 : a.localeCompare(b)));
  }, [n]);
  if (!con.length) return <p className="text-sm font-bold text-on-surface-variant/60 px-1">Nessuno stato dei portali ancora: il primo arriva dal collaudo della notte 25→26/11.</p>;
  const sez = n?.moduli?.stato_portali?.notte?.sezione;
  const P = n?.report_partner?.partner || {};
  return (
    <section className="space-y-3">
      <div className="flex gap-1.5 flex-wrap items-center">
        {con.slice(0, 10).map((x, j) => <button key={x.data || j} onClick={() => setScelta(j)} className={`px-2.5 py-1 rounded-lg text-[11px] font-black ${x === n ? 'bg-primary text-white' : 'bg-primary/10 text-primary'}`}>{x.data}</button>)}
        <label className="ml-auto text-[11px] font-bold text-on-surface-variant flex items-center gap-1"><input type="checkbox" checked={soloKo} onChange={(e) => setSoloKo(e.target.checked)} /> solo quelli che non funzionano</label>
      </div>
      {sez && <p className="text-[11px] font-semibold text-on-surface-variant/80 px-1">Portali: <b className="text-green-700">{sez.funzionano}</b> funzionano su {sez.provati} provati · provati il {new Date(sez.quando).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}</p>}

      {Object.keys(P).length > 0 && (
        <div className="p-3 rounded-2xl bg-white border border-outline-variant/10 space-y-1.5">
          <p className="text-sm font-black text-on-surface">Partner affiliati (tutti i paesi)</p>
          {Object.entries(P).filter(([, p]: any) => !soloKo || !(p.voto != null && p.voto >= 7)).map(([k, p]: any) => (
            <div key={k} className="flex items-start gap-2 text-[12px]">
              <Segno ok={p.voto == null ? null : p.voto >= 7} />
              <div className="min-w-0"><b>{NOMI_PARTNER[k] || k}</b> <span className="text-on-surface-variant/70">voto {p.voto ?? '–'} · città con risultati {p.citta_con_risultati}/{p.citta_provate}</span>
                {p.nota && <p className="text-[10px] text-on-surface-variant/60">{p.nota}</p>}</div>
            </div>
          ))}
        </div>
      )}

      {gruppi.map(([paese, righe]) => {
        const vis = righe.filter((r) => !soloKo || r.ok === false);
        if (!vis.length) return null;
        return (
          <div key={paese} className="p-3 rounded-2xl bg-white border border-outline-variant/10 space-y-1.5">
            <p className="text-sm font-black text-on-surface">{paese} <span className="text-[11px] font-bold text-on-surface-variant/60">{righe.filter((r) => r.ok).length}/{righe.filter((r) => r.ok !== null).length} funzionano</span></p>
            {vis.map((r, i) => (
              <div key={`${r.id}_${i}`} className="flex items-start gap-2 text-[12px]">
                <Segno ok={r.ok} />
                <div className="min-w-0">
                  <b>{r.nome}</b> <span className="text-on-surface-variant/70">· {r.tipo} · provato su {r.citta || '–'}</span>
                  {r.motivo && <p className="text-[10px] text-red-700 break-words">{r.motivo}</p>}
                  {r.url && <p className="text-[10px] text-on-surface-variant/50 break-all">{r.url}</p>}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
};

export default StatoPortali;
